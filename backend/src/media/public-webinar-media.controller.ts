import { Body, Controller, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/auth/public.decorator';
import { AdmitWebinarAttendeeDto } from './dto/admit-webinar-attendee.dto';
import { MediaService } from './media.service';

@ApiTags('public-webinar-media')
@Public()
@Controller('public/:organizationSlug/:workspaceSlug/events')
export class PublicWebinarMediaController {
  constructor(private readonly media: MediaService) {}

  @Post(':eventSlug/admission')
  admit(
    @Param('organizationSlug') organizationSlug: string,
    @Param('workspaceSlug') workspaceSlug: string,
    @Param('eventSlug') eventSlug: string,
    @Body() body: AdmitWebinarAttendeeDto,
  ) {
    return this.media.createPublicWebinarJoinToken(
      organizationSlug,
      workspaceSlug,
      eventSlug,
      body.registrationId,
      body.admissionToken,
    );
  }
}
