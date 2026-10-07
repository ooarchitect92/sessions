import { IsIn, IsString } from 'class-validator';

const ALLOWED_REACTIONS = ['👍', '❤️', '😂', '🎉', '👏', '👀'] as const;

export class ToggleChatReactionDto {
  @IsString()
  @IsIn(ALLOWED_REACTIONS)
  emoji!: (typeof ALLOWED_REACTIONS)[number];
}
