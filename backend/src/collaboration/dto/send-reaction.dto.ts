import { IsIn } from 'class-validator';

export const SESSION_REACTIONS = ['👍', '👏', '❤️', '😂', '🎉'] as const;

export class SendReactionDto {
  @IsIn(SESSION_REACTIONS)
  reaction!: (typeof SESSION_REACTIONS)[number];
}
