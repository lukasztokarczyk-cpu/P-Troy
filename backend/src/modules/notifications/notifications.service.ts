import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RealtimeGateway } from '../../common/gateways/realtime.gateway';
import { NotificationType, Role } from '@prisma/client';
import * as webpush from 'web-push';

interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
}

/**
 * Centralny punkt wysyłki powiadomień, z którego korzystają wszystkie
 * moduły (Harmonogram, Zadania, Budowy, Pojazdy, Magazyn...). Zapisuje
 * powiadomienie w bazie (widoczne w panelu), emituje event WebSocket
 * do zalogowanego klienta i, jeśli użytkownik ma zarejestrowaną
 * subskrypcję Push, wysyła powiadomienie push przez Web Push API.
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {
    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
      webpush.setVapidDetails(
        `mailto:${process.env.VAPID_CONTACT_EMAIL || 'admin@example.com'}`,
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY,
      );
    }
  }

  async create(input: CreateNotificationInput) {
    const notification = await this.prisma.notification.create({ data: input });
    this.realtime.emitToUsers([input.userId], 'notification:new', notification);
    return notification;
  }

  async notifyUsers(userIds: string[], input: Omit<CreateNotificationInput, 'userId'>) {
    return Promise.all(userIds.map((userId) => this.create({ ...input, userId })));
  }

  async notifyRoles(roles: Role[], input: Omit<CreateNotificationInput, 'userId'>) {
    const users = await this.prisma.user.findMany({
      where: { role: { in: roles }, isActive: true },
      select: { id: true },
    });
    return this.notifyUsers(users.map((u) => u.id), input);
  }

  async markRead(id: string, userId: string) {
    return this.prisma.notification.updateMany({
      where: { id, userId },
      data: { isRead: true },
    });
  }

  async markAllRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }

  async findForUser(userId: string, unreadOnly = false) {
    return this.prisma.notification.findMany({
      where: { userId, ...(unreadOnly ? { isRead: false } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async sendPush(userId: string, payload: { title: string; body: string; data?: Record<string, unknown> }) {
    const subs = await this.prisma.pushSubscription.findMany({ where: { userId } });
    await Promise.all(
      subs.map((sub) =>
        webpush
          .sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify(payload),
          )
          .catch(async (err) => {
            // Subskrypcja wygasła/nieaktualna — usuń, żeby nie ponawiać prób
            if (err.statusCode === 404 || err.statusCode === 410) {
              await this.prisma.pushSubscription.delete({ where: { id: sub.id } });
            }
          }),
      ),
    );
  }

  async registerPushSubscription(userId: string, endpoint: string, p256dh: string, auth: string) {
    return this.prisma.pushSubscription.upsert({
      where: { endpoint },
      update: { p256dh, auth },
      create: { userId, endpoint, p256dh, auth },
    });
  }
}
