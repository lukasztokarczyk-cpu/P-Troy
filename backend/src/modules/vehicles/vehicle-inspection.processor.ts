import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { VehiclesService } from './vehicles.service';
import { NotificationsService } from '../notifications/notifications.service';

// "Powiadomienia gdy zbliża się przegląd pojazdu" — sprawdzane raz dziennie
@Injectable()
export class VehicleInspectionProcessor {
  constructor(
    private readonly vehiclesService: VehiclesService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_7AM)
  async checkUpcomingInspections() {
    const vehicles = await this.vehiclesService.findVehiclesWithUpcomingInspection(14);

    for (const vehicle of vehicles) {
      const assignedUserIds = vehicle.assignments.map((a) => a.userId);
      await this.notifications.notifyRoles(['ADMIN'], {
        type: 'VEHICLE_INSPECTION_DUE',
        title: 'Zbliża się przegląd pojazdu',
        message: `Pojazd ${vehicle.registrationNumber} — przegląd do ${vehicle.inspectionDueDate?.toLocaleDateString('pl-PL')}`,
        entityType: 'Vehicle',
        entityId: vehicle.id,
      });
      if (assignedUserIds.length) {
        await this.notifications.notifyUsers(assignedUserIds, {
          type: 'VEHICLE_INSPECTION_DUE',
          title: 'Zbliża się przegląd Twojego pojazdu',
          message: `Pojazd ${vehicle.registrationNumber} — przegląd do ${vehicle.inspectionDueDate?.toLocaleDateString('pl-PL')}`,
          entityType: 'Vehicle',
          entityId: vehicle.id,
        });
      }
    }
  }
}
