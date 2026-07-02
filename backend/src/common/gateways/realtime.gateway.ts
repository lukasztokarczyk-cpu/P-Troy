import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger, UseGuards } from '@nestjs/common';
import { WsJwtGuard } from '../guards/ws-jwt.guard';

/**
 * Jeden centralny gateway dla całej aplikacji. Każdy moduł (Harmonogram,
 * Zadania, Magazyn, Pojazdy...) wstrzykuje ten sam serwis zamiast
 * otwierać własne połączenie — dzięki temu klient utrzymuje jedno
 * połączenie WebSocket niezależnie od liczby modułów.
 * Pokój (room) = ID użytkownika, więc emitowanie do konkretnych osób
 * (np. przypisanych do wydarzenia) jest trywialne.
 */
@Injectable()
@UseGuards(WsJwtGuard)
@WebSocketGateway({
  cors: { origin: process.env.FRONTEND_URL, credentials: true },
  namespace: 'realtime',
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  handleConnection(client: Socket) {
    const userId = client.handshake.auth?.userId;
    if (userId) {
      client.join(`user:${userId}`);
      this.logger.debug(`Klient połączony: user:${userId}`);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Klient rozłączony: ${client.id}`);
  }

  emitToUsers(userIds: string[], event: string, payload: unknown) {
    for (const userId of userIds) {
      this.server.to(`user:${userId}`).emit(event, payload);
    }
  }

  emitToRoles(roles: string[], event: string, payload: unknown) {
    for (const role of roles) {
      this.server.to(`role:${role}`).emit(event, payload);
    }
  }

  broadcast(event: string, payload: unknown) {
    this.server.emit(event, payload);
  }
}
