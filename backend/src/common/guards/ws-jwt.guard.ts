import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

// Weryfikuje JWT przekazany w handshake.auth.token przy połączeniu WebSocket
// (RealtimeGateway). Nieudana weryfikacja odrzuca połączenie na wejściu.
@Injectable()
export class WsJwtGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const client = context.switchToWs().getClient();
    const token = client.handshake?.auth?.token;
    if (!token) return false;
    try {
      const payload = this.jwtService.verify(token, { secret: process.env.JWT_ACCESS_SECRET });
      client.data.user = payload;
      return true;
    } catch {
      return false;
    }
  }
}
