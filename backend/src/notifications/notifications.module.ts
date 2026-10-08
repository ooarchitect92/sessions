import { Module } from '@nestjs/common';
import { OutboxModule } from '../outbox/outbox.module';
import { BookingReminderWorker } from './booking-reminder.worker';
import { EmailDeliveryProvider } from './email-delivery.provider';
import { EventReminderWorker } from './event-reminder.worker';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [OutboxModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    EmailDeliveryProvider,
    BookingReminderWorker,
    EventReminderWorker,
  ],
  exports: [EmailDeliveryProvider],
})
export class NotificationsModule {}
