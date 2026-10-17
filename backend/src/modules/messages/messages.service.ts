import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeGateway } from '../../common/gateways/realtime.gateway';
import { CreateMessageDto } from './dto/message.dto';

const SENDER = { select: { id: true, firstName: true, lastName: true } } as const;
const RECIPIENTS = { include: { user: { select: { id: true, firstName: true, lastName: true } } } } as const;

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
   * zapytanie zwraca tylko rozmowy (wiadomości główne z odpowiedziami), w których użytkownik jest
   * nadawcą LUB jednym ze wskazanych odbiorców. Nie ma tu żadnego
   * trybu "zobacz wszystkie", nawet dla administratora.
   */
  async findInbox(userId: string) {
    return this.prisma.message.findMany({
      where: { parentId: null, OR: [{ senderId: userId }, { recipients: { some: { userId } } }] },
      include: {
        sender: SENDER,
        recipients: RECIPIENTS,
        replies: { orderBy: { createdAt: 'asc' }, include: { sender: SENDER, recipients: RECIPIENTS } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  /** Wczytuje rozmowę, do której należy wskazana wiadomość (główna albo odpowiedź). */
  private async loadThread(messageId: string) {
    const msg = await this.prisma.message.findUnique({ where: { id: messageId }, select: { id: true, parentId: true } });
    if (!msg) throw new NotFoundException('Ta wiadomość już nie istnieje');
    const rootId = msg.parentId ?? msg.id;
    const root = await this.prisma.message.findUnique({
      where: { id: rootId },
      include: {
        sender: SENDER,
        recipients: RECIPIENTS,
        replies: { orderBy: { createdAt: 'asc' }, include: { sender: SENDER, recipients: RECIPIENTS } },
      },
    });
    if (!root) throw new NotFoundException('Ta wiadomość już nie istnieje');
    return root;
  }

  private participantIds(root: { senderId: string; recipients: { userId: string }[] }) {
    return Array.from(new Set([root.senderId, ...root.recipients.map((r) => r.userId)]));
  }

  /** Rozmowa dostępna tylko dla uczestników (nadawca + odbiorcy wiadomości głównej). */
  async getThread(messageId: string, userId: string) {
    const root = await this.loadThread(messageId);
    if (!this.participantIds(root).includes(userId)) throw new ForbiddenException('Nie masz uprawnień do tej wiadomości');
    return root;
  }

  /** Odpowiedź trafia do wszystkich pozostałych uczestników rozmowy. */
  async reply(messageId: string, content: string, userId: string) {
    const text = (content ?? '').trim();
    if (!text) throw new BadRequestException('Wpisz treść odpowiedzi');
    const root = await this.getThread(messageId, userId);
    const recipientIds = this.participantIds(root).filter((id) => id !== userId);

    const reply = await this.prisma.message.create({
      data: {
        senderId: userId,
        content: text,
        parentId: root.id,
        recipients: { create: recipientIds.map((id) => ({ userId: id })) },
      },
      include: { sender: SENDER, recipients: RECIPIENTS },
    });

    if (recipientIds.length > 0) {
      try {
        await this.notifications.notifyUsers(recipientIds, {
          type: 'NEW_MESSAGE',
          title: 'Nowa odpowiedź w rozmowie',
          message: `${reply.sender.firstName} ${reply.sender.lastName}: ${text.slice(0, 80)}`,
          entityType: 'Message',
          entityId: reply.id,
        });
        this.realtime.emitToUsers(recipientIds, 'message:new', { messageId: reply.id, threadId: root.id });
      } catch {
        // Powiadomienie nie może przewrócić wysłania odpowiedzi — wiadomość jest już zapisana.
      }
    }
    return reply;
  }

  /** Oznacza jako przeczytane całą rozmowę (wiadomość główną i odpowiedzi), w której użytkownik jest odbiorcą. */
  async markRead(messageId: string, userId: string) {
    const msg = await this.prisma.message.findUnique({ where: { id: messageId }, select: { id: true, parentId: true } });
    if (!msg) return;
    const rootId = msg.parentId ?? msg.id;
    await this.prisma.messageRecipient.updateMany({
      where: { userId, readAt: null, message: { OR: [{ id: rootId }, { parentId: rootId }] } },
      data: { readAt: new Date() },
    });
  }
}
