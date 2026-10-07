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

export const EventStatusSchema = z.enum(['DRAFT', 'PUBLISHED', 'LIVE', 'ENDED', 'CANCELLED']);
export const EventPresenterRoleSchema = z.enum([
  'ORGANIZER',
  'HOST',
  'CO_HOST',
  'SPEAKER',
]);
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
  version: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const PublicFormFieldTypeSchema = z.enum([
  'TEXT',
  'TEXTAREA',
  'SELECT',
  'CHECKBOX',
  'CONSENT',
]);

export const PublicFormFieldSchema = z.object({
  key: z.string().trim().min(1).max(80).regex(/^[a-z][a-z0-9_]*$/),
  label: z.string().trim().min(1).max(160),
  type: PublicFormFieldTypeSchema,
  required: z.boolean().default(false),
  placeholder: z.string().trim().max(240).optional(),
  options: z.array(z.string().trim().min(1).max(160)).max(50).default([]),
});

export const EventPresenterSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  workspaceId: z.uuid(),
  eventId: z.uuid(),
  userId: z.uuid().nullable(),
  role: EventPresenterRoleSchema,
  name: z.string(),
  email: z.email(),
  title: z.string().nullable(),
  bio: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  position: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const CreateEventPresenterSchema = z.object({
  role: EventPresenterRoleSchema.exclude(['ORGANIZER']),
  name: z.string().trim().min(1).max(160),
  email: z.email(),
  title: z.string().trim().max(160).optional(),
  bio: z.string().trim().max(4000).optional(),
  avatarUrl: z.url().startsWith('https://').optional(),
  position: z.number().int().min(0).max(1000).optional(),
});

export const CreateEventSchema = z.object({
  slug: SlugSchema,
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(10000).optional(),
  startsAt: z.iso.datetime(),
  durationMinutes: z.number().int().min(5).max(1440),
  timezone: z.string().trim().min(1).max(100),
  capacity: z.number().int().positive().max(100000).nullable().optional(),
  registrationFields: z.array(PublicFormFieldSchema).max(50).default([]),
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
  registrationFields: z.array(PublicFormFieldSchema),
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
  intakeFields: z.array(PublicFormFieldSchema).max(50).default([]),
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
  intakeFields: z.array(PublicFormFieldSchema),
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
  recipientUserId: z.uuid().nullable().optional(),
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
export type AgendaItemType = z.infer<typeof AgendaItemTypeSchema>;
export type CreateSessionInput = z.infer<typeof CreateSessionSchema>;
export type UpdateSessionInput = z.infer<typeof UpdateSessionSchema>;
export type CreateAgendaItemInput = z.infer<typeof CreateAgendaItemSchema>;
export type Session = z.infer<typeof SessionSchema>;
export type EventStatus = z.infer<typeof EventStatusSchema>;
export type EventPresenterRole = z.infer<typeof EventPresenterRoleSchema>;
export type EventPresenter = z.infer<typeof EventPresenterSchema>;
export type CreateEventPresenterInput = z.infer<typeof CreateEventPresenterSchema>;
export type PublicFormFieldType = z.infer<typeof PublicFormFieldTypeSchema>;
export type PublicFormField = z.infer<typeof PublicFormFieldSchema>;
export type CreateEventInput = z.infer<typeof CreateEventSchema>;
export type Event = z.infer<typeof EventSchema>;
export type RegisterForEventInput = z.infer<typeof RegisterForEventSchema>;
export type BookingStatus = z.infer<typeof BookingStatusSchema>;
export type AvailabilityRule = z.infer<typeof AvailabilityRuleSchema>;
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
