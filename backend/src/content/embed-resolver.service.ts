import { BadRequestException, Injectable } from '@nestjs/common';

export type EmbedProvider =
  | 'youtube'
  | 'vimeo'
  | 'google'
  | 'figma'
  | 'miro'
  | 'canva'
  | 'notion'
  | 'generic';

export interface ResolvedEmbed {
  provider: EmbedProvider;
  sourceUrl: string;
  embedUrl: string;
  hostname: string;
  sandbox: string;
  allow: string;
  referrerPolicy: 'no-referrer';
}

const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^\[?::1\]?$/,
  /^172\.(1[6-9]|2\d|3[01])\./,
];

@Injectable()
export class EmbedResolverService {
  resolve(rawUrl: string): ResolvedEmbed {
    let url: URL;
    try {
      url = new URL(rawUrl.trim());
    } catch {
      throw new BadRequestException('Embed URL is invalid');
    }

    if (url.protocol !== 'https:') {
      throw new BadRequestException('Only HTTPS embed URLs are allowed');
    }
    if (url.username || url.password) {
      throw new BadRequestException('Embed URLs cannot contain credentials');
    }
    if (PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(url.hostname))) {
      throw new BadRequestException('Private or loopback embed hosts are not allowed');
    }

    const provider = this.providerFor(url.hostname);
    const embedUrl = this.toEmbedUrl(url, provider);

    return {
      provider,
      sourceUrl: url.toString(),
      embedUrl,
      hostname: url.hostname,
      sandbox:
        provider === 'generic'
          ? 'allow-forms allow-popups allow-presentation allow-scripts'
          : 'allow-forms allow-popups allow-presentation allow-same-origin allow-scripts',
      allow:
        'autoplay; clipboard-read; clipboard-write; encrypted-media; fullscreen; picture-in-picture',
      referrerPolicy: 'no-referrer',
    };
  }

  private providerFor(hostname: string): EmbedProvider {
    const host = hostname.toLowerCase();
    if (
      host === 'youtube.com' ||
      host.endsWith('.youtube.com') ||
      host === 'youtu.be'
    ) {
      return 'youtube';
    }
    if (host === 'vimeo.com' || host.endsWith('.vimeo.com')) return 'vimeo';
    if (host === 'google.com' || host.endsWith('.google.com')) return 'google';
    if (host === 'figma.com' || host.endsWith('.figma.com')) return 'figma';
    if (host === 'miro.com' || host.endsWith('.miro.com')) return 'miro';
    if (host === 'canva.com' || host.endsWith('.canva.com')) return 'canva';
    if (host === 'notion.so' || host.endsWith('.notion.so')) return 'notion';
    return 'generic';
  }

  private toEmbedUrl(url: URL, provider: EmbedProvider): string {
    if (provider === 'youtube') {
      const videoId =
        url.hostname.toLowerCase() === 'youtu.be'
          ? url.pathname.split('/').filter(Boolean)[0]
          : url.searchParams.get('v') ??
            this.youtubePathId(url.pathname);
      if (!videoId || !/^[A-Za-z0-9_-]{6,20}$/.test(videoId)) {
        throw new BadRequestException('YouTube URL does not contain a valid video ID');
      }
      return `https://www.youtube-nocookie.com/embed/${videoId}`;
    }

    if (provider === 'vimeo') {
      const videoId = url.pathname.split('/').filter(Boolean).find((part) => /^\d+$/.test(part));
      if (!videoId) {
        throw new BadRequestException('Vimeo URL does not contain a valid video ID');
      }
      return `https://player.vimeo.com/video/${videoId}`;
    }

    return url.toString();
  }

  private youtubePathId(pathname: string): string | null {
    const parts = pathname.split('/').filter(Boolean);
    const markerIndex = parts.findIndex((part) =>
      ['embed', 'shorts', 'live'].includes(part),
    );
    return markerIndex >= 0 ? (parts[markerIndex + 1] ?? null) : null;
  }
}
