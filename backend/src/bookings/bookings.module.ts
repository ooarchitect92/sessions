import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { OutboxModule } from '../outbox/outbox.module';
import { BookingsController } from './bookings.controller';
import { CalendarInviteService } from './calendar-invite.service';
import { BookingsService } from './bookings.service';
import { PublicBookingsController } from './public-bookings.controller';

@Module({
  imports: [AuditModule, OutboxModule],
  controllers: [BookingsController, PublicBookingsController],
  providers: [BookingsService, CalendarInviteService],
  exports: [BookingsService],
})
export class BookingsModule {}
