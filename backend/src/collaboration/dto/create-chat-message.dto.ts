import { ChatChannel } from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  ValidateIf,
} from 'class-validator';

export class CreateChatMessageDto {
  @IsEnum(ChatChannel)
  channel: ChatChannel = ChatChannel.EVERYONE;

  @ValidateIf((value: CreateChatMessageDto) => value.channel === ChatChannel.DIRECT)
  @IsUUID('4')
  recipientUserId?: string;

  @ValidateIf((value: CreateChatMessageDto) => value.channel !== ChatChannel.DIRECT)
  @IsOptional()
  recipientUserId?: string;

  @IsString()
  @Length(1, 5000)
  body!: string;
}
