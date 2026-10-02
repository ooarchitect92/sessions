import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/auth/public.decorator';
import { RegisterEventDto } from './dto/register-event.dto';
import { EventsService } from './events.service';

@ApiTags('public-events')
@Public()
@Controller('public/:organizationSlug/:workspaceSlug/events')
export class PublicEventsController {
  constructor(private readonly events: EventsService) {}

  @Get(':eventSlug')
  getPublished(
    @Param('organizationSlug') organizationSlug: string,
    @Param('workspaceSlug') workspaceSlug: string,
    @Param('eventSlug') eventSlug: string,
  ) {
    return this.events.getPublished(organizationSlug, workspaceSlug, eventSlug);
  }

  @Post(':eventSlug/registrations')
  register(
    @Param('organizationSlug') organizationSlug: string,
    @Param('workspaceSlug') workspaceSlug: string,
    @Param('eventSlug') eventSlug: string,
    @Body() body: RegisterEventDto,
  ) {
    return this.events.register(organizationSlug, workspaceSlug, eventSlug, body);
  }
}
