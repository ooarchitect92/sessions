import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NotificationStatus } from '@prisma/client';
import { HOST_ROLES, hasAnyRole, type Principal } from '../common/auth/principal';
import { TenantDatabaseService } from '../database/tenant-database.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly database: TenantDatabaseService) {}

  async listBookingDeliveries(principal: Principal, reservationId: string) {
    this.assertHost(principal);
    return this.database.run(principal, async (transaction) => {
      const reservation = await transaction.bookingReservation.findUnique({
        where: { id: reservationId },
        select: { id: true },
      });
      if (!reservation) throw new NotFoundException('Reservation not found');
      return transaction.notificationDelivery.findMany({
        where: { bookingReservationId: reservationId },
        orderBy: [{ scheduledFor: 'asc' }, { createdAt: 'asc' }],
      });
    });
  }

  async retry(principal: Principal, deliveryId: string) {
    this.assertHost(principal);
    return this.database.run(principal, async (transaction) => {
      const current = await transaction.notificationDelivery.findUnique({
        where: { id: deliveryId },
      });
      if (!current) throw new NotFoundException('Notification delivery not found');
      if (
        current.status !== NotificationStatus.FAILED &&
        current.status !== NotificationStatus.DEAD_LETTER
      ) {
        throw new ConflictException('Only failed deliveries can be retried');
      }
      return transaction.notificationDelivery.update({
        where: { id: deliveryId },
        data: {
          status: NotificationStatus.PENDING,
          nextAttemptAt: new Date(),
          lastError: null,
        },
      });
    });
  }

  private assertHost(principal: Principal): void {
    if (!hasAnyRole(principal, HOST_ROLES)) {
      throw new ForbiddenException('A host role is required');
    }
  }
}
