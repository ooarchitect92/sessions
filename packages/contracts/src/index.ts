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
export const AgendaTimerStatusSchema = z.enum([
  'IDLE',
  'RUNNING',
  'PAUSED',
  'EXPIRED',
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

export const EventStatusSchema = z.enum(['DRAFT', 'PUBLISHED', 'LIVE', 'ENDED', 'CANCELLED']);
export const RegistrationStatusSchema = z.enum([
  'REGISTERED',
  'WAITLISTED',
  'CANCELLED',
  'ATTENDED',
  'NO_SHOW',
]);
export const BookingStatusSchema = z.enum(['CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW']);
export const ArtifactStatusSchema = z.enum([
  'PENDING',
  'PROCESSING',
  'READY',
  'FAILED',
  'DELETING',
  'DELETED',
]);
export const RecordingConsentDecisionSchema = z.enum([
  'GRANTED',
  'DECLINED',
  'REVOKED',
]);
export const ChatChannelSchema = z.enum(['EVERYONE', 'HOSTS', 'PRIVATE']);
export const PollTypeSchema = z.enum([
  'SINGLE_CHOICE',
  'MULTIPLE_CHOICE',
  'OPEN_TEXT',
  'NPS',
  'WORD_CLOUD',
]);
export const PollStatusSchema = z.enum(['DRAFT', 'LIVE', 'CLOSED']);
export const QuestionStatusSchema = z.enum(['PENDING', 'APPROVED', 'ANSWERED', 'HIDDEN']);

const SlugSchema = z
  .string()
  .trim()
  .min(2)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const CreateRoomSchema = z.object({
  title: z.string().trim().min(1).max(160),
  slug: SlugSchema,
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
  agendaTimerStatus: AgendaTimerStatusSchema,
  agendaTimerRemainingSeconds: z.number().int().nonnegative(),
  agendaTimerEndsAt: z.iso.datetime().nullable(),
  agendaTimerStartedAt: z.iso.datetime().nullable(),
  version: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const EventRegistrationFieldTypeSchema = z.enum([
  'TEXT',
  'TEXTAREA',
  'EMAIL',
  'SELECT',
  'CHECKBOX',
  'CONSENT',
]);

export const EventRegistrationFieldSchema = z.object({
  key: z
    .string()
    .regex(/^[a-z][a-z0-9_]{0,63}$/)
    .refine((key) => !['name', 'email'].includes(key), {
      message: 'name and email are reserved registration keys',
    }),
  label: z.string().trim().min(1).max(160),
  type: EventRegistrationFieldTypeSchema,
  required: z.boolean().default(false),
  placeholder: z.string().max(200).optional(),
  options: z.array(z.string().trim().min(1).max(160)).max(50).optional(),
});

export const CreateEventSchema = z.object({
  slug: SlugSchema,
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(10000).optional(),
  startsAt: z.iso.datetime(),
  durationMinutes: z.number().int().min(5).max(1440),
  timezone: z.string().trim().min(1).max(100),
  capacity: z.number().int().positive().max(100000).nullable().optional(),
  registrationFields: z.array(EventRegistrationFieldSchema).max(50).default([]),
  branding: z.record(z.string(), z.unknown()).default({}),
});

export const EventSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  workspaceId: z.uuid(),
  sessionId: z.uuid().nullable(),
  slug: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  startsAt: z.iso.datetime(),
  durationMinutes: z.number().int(),
  timezone: z.string(),
  capacity: z.number().int().nullable(),
  status: EventStatusSchema,
  registrationFields: z.array(EventRegistrationFieldSchema),
  branding: z.record(z.string(), z.unknown()),
  publishedAt: z.iso.datetime().nullable(),
  version: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const RegisterForEventSchema = z.object({
  name: z.string().trim().min(1).max(160),
  email: z.email(),
  answers: z.record(z.string(), z.unknown()).default({}),
});

export const AvailabilityRuleSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
});

export const IntakeFieldTypeSchema = z.enum([
  'TEXT',
  'TEXTAREA',
  'EMAIL',
  'SELECT',
  'CHECKBOX',
  'CONSENT',
]);

export const IntakeFieldSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
  label: z.string().trim().min(1).max(160),
  type: IntakeFieldTypeSchema,
  required: z.boolean().default(false),
  placeholder: z.string().max(200).optional(),
  options: z.array(z.string().trim().min(1).max(160)).max(50).optional(),
});

export const CreateBookingPageSchema = z.object({
  slug: SlugSchema,
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(5000).optional(),
  durationMinutes: z.number().int().min(5).max(480),
  timezone: z.string().trim().min(1).max(100),
  minimumNoticeMinutes: z.number().int().min(0).max(525600).default(60),
  bufferBeforeMinutes: z.number().int().min(0).max(1440).default(0),
  bufferAfterMinutes: z.number().int().min(0).max(1440).default(0),
  availabilityRules: z.array(AvailabilityRuleSchema).min(1),
  intakeFields: z.array(IntakeFieldSchema).max(50).default([]),
});

export const BookingPageSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  workspaceId: z.uuid(),
  slug: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  durationMinutes: z.number().int(),
  timezone: z.string(),
  minimumNoticeMinutes: z.number().int(),
  bufferBeforeMinutes: z.number().int(),
  bufferAfterMinutes: z.number().int(),
  availabilityRules: z.array(AvailabilityRuleSchema),
  intakeFields: z.array(z.record(z.string(), z.unknown())),
  active: z.boolean(),
  version: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const ReserveBookingSchema = z.object({
  name: z.string().trim().min(1).max(160),
  email: z.email(),
  startsAt: z.iso.datetime(),
  timezone: z.string().trim().min(1).max(100),
  answers: z.record(z.string(), z.unknown()).default({}),
});

export const ChatMessageSchema = z.object({
  id: z.uuid(),
  sessionId: z.uuid(),
  authorUserId: z.uuid(),
  channel: ChatChannelSchema,
  body: z.string(),
  editedAt: z.iso.datetime().nullable(),
  deletedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});

export const CreatePollSchema = z.object({
  question: z.string().trim().min(1).max(1000),
  type: PollTypeSchema,
  anonymous: z.boolean().default(false),
  options: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
});

export const SubmitPollAnswerSchema = z.object({
  selectedOptionIds: z.array(z.uuid()).max(20).default([]),
  textAnswer: z.string().trim().max(5000).optional(),
});

export const CreateQuestionSchema = z.object({
  body: z.string().trim().min(1).max(5000),
  isAnonymous: z.boolean().default(false),
});

export type WorkspaceRole = z.infer<typeof WorkspaceRoleSchema>;
export type CreateRoomInput = z.infer<typeof CreateRoomSchema>;
export type UpdateRoomInput = z.infer<typeof UpdateRoomSchema>;
export type Room = z.infer<typeof RoomSchema>;
export type SessionKind = z.infer<typeof SessionKindSchema>;
export type SessionStatus = z.infer<typeof SessionStatusSchema>;
export type AgendaTimerStatus = z.infer<typeof AgendaTimerStatusSchema>;
export type AgendaItemType = z.infer<typeof AgendaItemTypeSchema>;
export type CreateSessionInput = z.infer<typeof CreateSessionSchema>;
export type UpdateSessionInput = z.infer<typeof UpdateSessionSchema>;
export type CreateAgendaItemInput = z.infer<typeof CreateAgendaItemSchema>;
export type Session = z.infer<typeof SessionSchema>;
export type EventStatus = z.infer<typeof EventStatusSchema>;
export type EventRegistrationFieldType = z.infer<
  typeof EventRegistrationFieldTypeSchema
>;
export type EventRegistrationField = z.infer<
  typeof EventRegistrationFieldSchema
>;
export type CreateEventInput = z.infer<typeof CreateEventSchema>;
export type Event = z.infer<typeof EventSchema>;
export type RegisterForEventInput = z.infer<typeof RegisterForEventSchema>;
export type BookingStatus = z.infer<typeof BookingStatusSchema>;
export type AvailabilityRule = z.infer<typeof AvailabilityRuleSchema>;
export type IntakeFieldType = z.infer<typeof IntakeFieldTypeSchema>;
export type IntakeField = z.infer<typeof IntakeFieldSchema>;
export type CreateBookingPageInput = z.infer<typeof CreateBookingPageSchema>;
export type BookingPage = z.infer<typeof BookingPageSchema>;
export type ReserveBookingInput = z.infer<typeof ReserveBookingSchema>;
export type ArtifactStatus = z.infer<typeof ArtifactStatusSchema>;
export type RecordingConsentDecision = z.infer<
  typeof RecordingConsentDecisionSchema
>;
export type ChatChannel = z.infer<typeof ChatChannelSchema>;
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type PollType = z.infer<typeof PollTypeSchema>;
export type PollStatus = z.infer<typeof PollStatusSchema>;
export type CreatePollInput = z.infer<typeof CreatePollSchema>;
export type SubmitPollAnswerInput = z.infer<typeof SubmitPollAnswerSchema>;
export type QuestionStatus = z.infer<typeof QuestionStatusSchema>;
export type CreateQuestionInput = z.infer<typeof CreateQuestionSchema>;

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
