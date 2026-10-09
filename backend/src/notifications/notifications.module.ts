import { Module } from '@nestjs/common';
import { IntegrationsModule } from '../integrations/integrations.module';
import { OutboxModule } from '../outbox/outbox.module';
import { BookingReminderWorker } from './booking-reminder.worker';
import { EmailDeliveryProvider } from './email-delivery.provider';
import { EventReminderWorker } from './event-reminder.worker';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [IntegrationsModule, OutboxModule],
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
