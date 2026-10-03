import { ChatChannel } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, Length } from 'class-validator';

export class CreateChatMessageDto {
  @IsEnum(ChatChannel)
  channel: ChatChannel = ChatChannel.EVERYONE;

  @IsOptional()
  @IsUUID('4')
  recipientUserId?: string;

  @IsString()
  @Length(1, 5000)
  body!: string;
}
