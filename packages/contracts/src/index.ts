import { z } from 'zod';

export const WorkspaceRoleSchema = z.enum([
  'OWNER',
  'ADMIN',
  'HOST',
  'MEMBER',
  'ANALYST',
  'GUEST',
]);

export const SessionKindSchema = z.enum(['MEETING', 'WEBINAR']);
export const SessionStatusSchema = z.enum([
  'DRAFT',
  'SCHEDULED',
  'LIVE',
  'ENDED',
  'CANCELLED',
  'PROCESSING',
  'READY',
  'FAILED',
]);

export const AgendaItemTypeSchema = z.enum([
  'TEXT',
  'PRESENTATION',
  'WEBSITE',
  'VIDEO',
  'POLL',
  'WHITEBOARD',
  'BREAKOUT',
  'QA',
  'SCREEN_SHARE',
]);

export const CreateRoomSchema = z.object({
  title: z.string().trim().min(1).max(160),
  slug: z.string().trim().min(2).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  settings: z.record(z.string(), z.unknown()).default({}),
});

export const UpdateRoomSchema = CreateRoomSchema.partial();

export const RoomSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  workspaceId: z.uuid(),
  slug: z.string(),
  title: z.string(),
  settings: z.record(z.string(), z.unknown()),
  version: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const CreateSessionSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(5000).optional(),
  kind: SessionKindSchema.default('MEETING'),
  startsAt: z.iso.datetime(),
  durationMinutes: z.number().int().min(5).max(1440),
  timezone: z.string().trim().min(1).max(100),
  roomId: z.uuid().optional(),
  recordingEnabled: z.boolean().default(false),
  transcriptionEnabled: z.boolean().default(false),
});

export const UpdateSessionSchema = CreateSessionSchema.partial().extend({
  roomId: z.uuid().nullable().optional(),
});

export const CreateAgendaItemSchema = z.object({
  title: z.string().trim().min(1).max(160),
  durationSeconds: z.number().int().min(0).max(86400),
  type: AgendaItemTypeSchema,
  content: z.record(z.string(), z.unknown()).default({}),
});

export const SessionSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  workspaceId: z.uuid(),
  roomId: z.uuid().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  kind: SessionKindSchema,
  status: SessionStatusSchema,
  startsAt: z.iso.datetime(),
  durationMinutes: z.number().int(),
  timezone: z.string(),
  recordingEnabled: z.boolean(),
  transcriptionEnabled: z.boolean(),
  currentAgendaItemId: z.uuid().nullable(),
  version: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type WorkspaceRole = z.infer<typeof WorkspaceRoleSchema>;
export type CreateRoomInput = z.infer<typeof CreateRoomSchema>;
export type UpdateRoomInput = z.infer<typeof UpdateRoomSchema>;
export type Room = z.infer<typeof RoomSchema>;
export type SessionKind = z.infer<typeof SessionKindSchema>;
export type SessionStatus = z.infer<typeof SessionStatusSchema>;
export type AgendaItemType = z.infer<typeof AgendaItemTypeSchema>;
export type CreateSessionInput = z.infer<typeof CreateSessionSchema>;
export type UpdateSessionInput = z.infer<typeof UpdateSessionSchema>;
export type CreateAgendaItemInput = z.infer<typeof CreateAgendaItemSchema>;
export type Session = z.infer<typeof SessionSchema>;

export interface ApiEnvelope<T> {
  data: T;
  meta: {
    requestId: string;
    timestamp: string;
  };
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}
