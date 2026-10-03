import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal } from '../common/auth/current-principal.decorator';
import type { Principal } from '../common/auth/principal';
import { CreateEventDto } from './dto/create-event.dto';
import { CreateEventSpeakerDto } from './dto/create-event-speaker.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { UpdateEventSpeakerDto } from './dto/update-event-speaker.dto';
import { UpdateRegistrationStatusDto } from './dto/update-registration-status.dto';
import { EventsService } from './events.service';

function parseVersion(value: string | undefined): number {
  if (!value) throw new BadRequestException('If-Match is required');
  const parsed = Number(value.replace(/^W\//, '').replaceAll('"', '').trim());
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new BadRequestException('If-Match must contain a positive integer version');
  }
  return parsed;
}

@ApiTags('events')
@ApiBearerAuth()
@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Post()
  create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: CreateEventDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!idempotencyKey || idempotencyKey.length > 200) {
      throw new BadRequestException('A valid Idempotency-Key header is required');
    }
    return this.events.create(principal, body, idempotencyKey);
  }

  @Get()
  list(@CurrentPrincipal() principal: Principal) {
    return this.events.list(principal);
  }

  @Get(':id')
  getById(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.events.getById(principal, id);
  }

  @Patch(':id')
  update(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateEventDto,
  ) {
    return this.events.update(principal, id, parseVersion(ifMatch), body);
  }

  @Post(':id/publish')
  publish(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ) {
    return this.events.publish(principal, id, parseVersion(ifMatch));
  }

  @Post(':id/cancel')
  cancel(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ) {
    return this.events.cancel(principal, id, parseVersion(ifMatch));
  }

  @Get(':id/speakers')
  speakers(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) eventId: string,
  ) {
    return this.events.listSpeakers(principal, eventId);
  }

  @Post(':id/speakers')
  createSpeaker(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) eventId: string,
    @Body() body: CreateEventSpeakerDto,
  ) {
    return this.events.createSpeaker(principal, eventId, body);
  }

  @Patch(':eventId/speakers/:speakerId')
  updateSpeaker(
    @CurrentPrincipal() principal: Principal,
    @Param('eventId', new ParseUUIDPipe({ version: '4' })) eventId: string,
    @Param('speakerId', new ParseUUIDPipe({ version: '4' })) speakerId: string,
    @Body() body: UpdateEventSpeakerDto,
  ) {
    return this.events.updateSpeaker(principal, eventId, speakerId, body);
  }

  @Delete(':eventId/speakers/:speakerId')
  deleteSpeaker(
    @CurrentPrincipal() principal: Principal,
    @Param('eventId', new ParseUUIDPipe({ version: '4' })) eventId: string,
    @Param('speakerId', new ParseUUIDPipe({ version: '4' })) speakerId: string,
  ) {
    return this.events.deleteSpeaker(principal, eventId, speakerId);
  }

  @Get(':id/registrations')
  registrations(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.events.listRegistrations(principal, id);
  }

  @Patch(':eventId/registrations/:registrationId')
  updateRegistration(
    @CurrentPrincipal() principal: Principal,
    @Param('eventId', new ParseUUIDPipe({ version: '4' })) eventId: string,
    @Param('registrationId', new ParseUUIDPipe({ version: '4' })) registrationId: string,
    @Body() body: UpdateRegistrationStatusDto,
  ) {
    return this.events.updateRegistrationStatus(
      principal,
      eventId,
      registrationId,
      body.status,
    );
  }
}
