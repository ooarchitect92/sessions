import { IsBoolean, IsIn, IsOptional, IsString, Length } from 'class-validator';

export const WORKSPACE_EMAIL_TEMPLATE_KINDS = [
  'EVENT_REMINDER_24H',
  'EVENT_REMINDER_1H',
  'BOOKING_REMINDER_24H',
  'BOOKING_REMINDER_1H',
] as const;

export type WorkspaceEmailTemplateKind =
  (typeof WORKSPACE_EMAIL_TEMPLATE_KINDS)[number];

export class UpsertWorkspaceEmailTemplateDto {
  @IsIn(WORKSPACE_EMAIL_TEMPLATE_KINDS)
  kind!: WorkspaceEmailTemplateKind;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsString()
  @Length(1, 240)
  subject!: string;

  @IsString()
  @Length(1, 10_000)
  bodyText!: string;

  @IsOptional()
  @IsString()
  @Length(0, 2_000)
  signature?: string;
}