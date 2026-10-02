import { ChatChannel } from '@prisma/client';
import { IsEnum, IsString, Length } from 'class-validator';

export class CreateChatMessageDto {
  @IsEnum(ChatChannel)
  channel: ChatChannel = ChatChannel.EVERYONE;

  @IsString()
  @Length(1, 5000)
  body!: string;
}
