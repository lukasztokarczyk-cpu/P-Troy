import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeGateway } from '../../common/gateways/realtime.gateway';
import { CreateMessageDto } from './dto/message.dto';

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async send(dto: CreateMessageDto, senderId: string) {
    const message = await this.prisma.message.create({
      data: {
        senderId,
        content: dto.content,
        recipients: { create: dto.recipientIds.map((userId) => ({ userId })) },
      },
      include: { sender: { select: { firstName: true, lastName: true } }, recipients: true },
    });

    await this.notifications.notifyUsers(dto.recipientIds, {
      type: 'NEW_MESSAGE',
      title: 'Nowa wiadomość',
      message: `${message.sender.firstName} ${message.sender.lastName}: ${dto.content.slice(0, 80)}`,
      entityType: 'Message',
      entityId: message.id,
    });
    this.realtime.emitToUsers(dto.recipientIds, 'message:new', { messageId: message.id });

    return message;
  }

  /**
   * "Wiadomości są widoczne wyłącznie dla wybranych odbiorców" —
   * zapytanie zwraca tylko wiadomości, w których użytkownik jest
   * nadawcą LUB jednym ze wskazanych odbiorców. Nie ma tu żadnego
   * trybu "zobacz wszystkie", nawet dla administratora.
   */
  async findInbox(userId: string) {
    return this.prisma.message.findMany({
      where: { OR: [{ senderId: userId }, { recipients: { some: { userId } } }] },
      include: {
        sender: { select: { id: true, firstName: true, lastName: true } },
        recipients: { include: { user: { select: { id: true, firstName: true, lastName: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async markRead(messageId: string, userId: string) {
    await this.prisma.messageRecipient.updateMany({
      where: { messageId, userId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}
