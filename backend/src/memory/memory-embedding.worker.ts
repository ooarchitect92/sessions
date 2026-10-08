import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { WorkerPrismaService } from '../database/worker-prisma.service';
import { EmbeddingProviderService } from './embedding-provider.service';

interface TranscriptCandidate {
  id: string;
  organizationId: string;
  workspaceId: string;
  sessionId: string;
  version: number;
}

interface TranscriptSegmentRow {
  startMs: number;
  endMs: number;
  speakerLabel: string | null;
  text: string;
}

interface EmbeddingIndexRow {
  id: string;
}

interface VersionRow {
  version: number;
}

interface Chunk {
  content: string;
  startMs: number | null;
  endMs: number | null;
}

@Injectable()
export class MemoryEmbeddingWorker {
  private readonly logger = new Logger(MemoryEmbeddingWorker.name);
  private running = false;

  constructor(
    private readonly prisma: WorkerPrismaService,
    private readonly config: ConfigService,
    private readonly provider: EmbeddingProviderService,
  ) {}

  @Interval(4000)
  async runCycle(): Promise<void> {
    if (!this.provider.isEnabled() || this.running) return;
    this.running = true;
    try {
      const candidates = await this.prisma.$queryRawUnsafe<TranscriptCandidate[]>(
        "SELECT t.id::text AS \"id\", t.organization_id::text AS \"organizationId\", t.workspace_id::text AS \"workspaceId\", t.session_id::text AS \"sessionId\", t.version AS \"version\" FROM transcripts t LEFT JOIN memory_embedding_indexes i ON i.transcript_id = t.id WHERE t.status = 'READY' AND t.full_text IS NOT NULL AND length(trim(t.full_text)) > 0 AND (i.id IS NULL OR i.source_transcript_version <> t.version OR i.status = 'PENDING') ORDER BY t.updated_at ASC LIMIT 3",
      );

      for (const transcript of candidates) {
        await this.indexTranscript(transcript);
      }
    } catch (error: unknown) {
      this.logger.error(
        'Memory embedding worker cycle failed',
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.running = false;
    }
  }

  private async indexTranscript(transcript: TranscriptCandidate): Promise<void> {
    const provider = this.provider.providerName();
    const model = this.provider.modelName();
    const claimed = await this.prisma.$queryRawUnsafe<EmbeddingIndexRow[]>(
      "INSERT INTO memory_embedding_indexes (organization_id, workspace_id, session_id, transcript_id, source_transcript_version, provider, model, status, chunk_count, failure_code, completed_at, updated_at) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, 'PROCESSING', 0, NULL, NULL, CURRENT_TIMESTAMP) ON CONFLICT (transcript_id) DO UPDATE SET source_transcript_version = EXCLUDED.source_transcript_version, provider = EXCLUDED.provider, model = EXCLUDED.model, status = 'PROCESSING', chunk_count = 0, failure_code = NULL, completed_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE memory_embedding_indexes.source_transcript_version <> EXCLUDED.source_transcript_version OR memory_embedding_indexes.status = 'PENDING' RETURNING id::text AS \"id\"",
      transcript.organizationId,
      transcript.workspaceId,
      transcript.sessionId,
      transcript.id,
      transcript.version,
      provider,
      model,
    );
    const index = claimed[0];
    if (!index) return;

    try {
      const segments = await this.prisma.$queryRawUnsafe<TranscriptSegmentRow[]>(
        'SELECT start_ms AS "startMs", end_ms AS "endMs", speaker_label AS "speakerLabel", text FROM transcript_segments WHERE transcript_id = $1::uuid ORDER BY position ASC',
        transcript.id,
      );
      const chunks = this.chunkSegments(segments);
      if (chunks.length === 0) throw new Error('embedding_source_empty');

      const batch = await this.provider.embed(chunks.map((chunk) => chunk.content));
      if (batch.vectors.length !== chunks.length) {
        throw new Error('embedding_count_mismatch');
      }

      await this.prisma.$transaction(async (transaction) => {
        const current = await transaction.$queryRawUnsafe<VersionRow[]>(
          'SELECT version FROM transcripts WHERE id = $1::uuid LIMIT 1',
          transcript.id,
        );
        if (current[0]?.version !== transcript.version) {
          await transaction.$executeRawUnsafe(
            "UPDATE memory_embedding_indexes SET status = 'PENDING', failure_code = NULL, completed_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1::uuid",
            index.id,
          );
          return;
        }

        await transaction.$executeRawUnsafe(
          'DELETE FROM memory_embedding_chunks WHERE index_id = $1::uuid',
          index.id,
        );

        for (let position = 0; position < chunks.length; position += 1) {
          const chunk = chunks[position];
          const vector = batch.vectors[position];
          if (!chunk || !vector) continue;
          const vectorLiteral = '[' + vector.join(',') + ']';
          await transaction.$executeRawUnsafe(
            'INSERT INTO memory_embedding_chunks (organization_id, workspace_id, index_id, session_id, transcript_id, position, start_ms, end_ms, content, embedding) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6, $7, $8, $9, $10::vector)',
            transcript.organizationId,
            transcript.workspaceId,
            index.id,
            transcript.sessionId,
            transcript.id,
            position,
            chunk.startMs,
            chunk.endMs,
            chunk.content,
            vectorLiteral,
          );
        }

        await transaction.$executeRawUnsafe(
          "UPDATE memory_embedding_indexes SET provider = $1, model = $2, status = 'READY', chunk_count = $3, failure_code = NULL, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $4::uuid AND source_transcript_version = $5",
          batch.provider,
          batch.model,
          chunks.length,
          index.id,
          transcript.version,
        );
      });
    } catch (error: unknown) {
      const failureCode = ('embedding_failed:' + this.message(error)).slice(0, 160);
      await this.prisma.$executeRawUnsafe(
        "UPDATE memory_embedding_indexes SET status = 'FAILED', failure_code = $1, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $2::uuid",
        failureCode,
        index.id,
      );
    }
  }

  private chunkSegments(segments: TranscriptSegmentRow[]): Chunk[] {
    const maxChars = this.config.get<number>('EMBEDDING_CHUNK_MAX_CHARS', 1800);
    const chunks: Chunk[] = [];
    let parts: string[] = [];
    let size = 0;
    let startMs: number | null = null;
    let endMs: number | null = null;

    const flush = () => {
      const content = parts.join('\n').trim();
      if (content) chunks.push({ content, startMs, endMs });
      parts = [];
      size = 0;
      startMs = null;
      endMs = null;
    };

    for (const segment of segments) {
      const line = segment.speakerLabel
        ? segment.speakerLabel + ': ' + segment.text.trim()
        : segment.text.trim();
      if (!line) continue;
      if (parts.length > 0 && size + line.length + 1 > maxChars) flush();
      if (startMs === null) startMs = segment.startMs;
      endMs = segment.endMs;
      parts.push(line);
      size += line.length + 1;
    }
    flush();
    return chunks;
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message.slice(0, 140) : 'unknown';
  }
}
