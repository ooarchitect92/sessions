import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
} from 'class-validator';

export class SendFollowUpDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsEmail({}, { each: true })
  recipients!: string[];
}
