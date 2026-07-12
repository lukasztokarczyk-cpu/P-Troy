import { Module } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule as NestScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';

import { PrismaModule } from './common/prisma/prisma.module';
import { RealtimeModule } from './common/gateways/realtime.module';
import { MailModule } from './common/mail/mail.module';
import { FileStorageModule } from './common/storage/file-storage.module';
import { PdfModule } from './common/pdf/pdf.module';
import { LabelsModule } from './common/labels/labels.module';

import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AuditLogModule } from './modules/audit-log/audit-log.module';
import { AdminTilesModule } from './modules/admin-tiles/admin-tiles.module';

import { ScheduleModule } from './modules/schedule/schedule.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { SignaturesModule } from './modules/signatures/signatures.module';
import { InventoryCodesModule } from './modules/inventory-codes/inventory-codes.module';
import { SitesModule } from './modules/sites/sites.module';
import { WarehouseModule } from './modules/warehouse/warehouse.module';
import { VehiclesModule } from './modules/vehicles/vehicles.module';
import { MeasurementsModule } from './modules/measurements/measurements.module';
import { ExpensesModule } from './modules/expenses/expenses.module';
import { TimeTrackingModule } from './modules/time-tracking/time-tracking.module';
import { SettingsModule } from './modules/settings/settings.module';

/**
 * Rdzeń aplikacji. Każdy kafelek/moduł biznesowy jest samodzielnym
 * modułem NestJS zaimportowanym tutaj — dodanie nowego modułu w
 * przyszłości (np. "Faktury", "Reklamacje") wymaga wyłącznie dopisania
 * go do tej listy; żaden z istniejących modułów nie wymaga zmian.
 */
@Module({
  imports: [
    // Rdzeń
    PrismaModule,
    RealtimeModule,
    MailModule,
    FileStorageModule,
    PdfModule,
    LabelsModule,
    NestScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]), // globalny rate limiting

    AuthModule,
    UsersModule,
    NotificationsModule,
    AuditLogModule,
    AdminTilesModule,

    // Kafelki biznesowe
    ScheduleModule,
    TasksModule,
    SignaturesModule,
    InventoryCodesModule,
    SitesModule,
    WarehouseModule,
    VehiclesModule,
    MeasurementsModule,
    ExpensesModule,
    TimeTrackingModule,
    SettingsModule,
  ],
  providers: [
    // Rate limiting egzekwowany globalnie na wszystkich endpointach
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
