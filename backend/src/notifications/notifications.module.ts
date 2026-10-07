import { Module } from '@nestjs/common';
import { OutboxModule } from '../outbox/outbox.module';
import { BookingReminderWorker } from './booking-reminder.worker';
import { EmailDeliveryProvider } from './email-delivery.provider';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [OutboxModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    EmailDeliveryProvider,
    BookingReminderWorker,
  ],
})
export class NotificationsModule {}
