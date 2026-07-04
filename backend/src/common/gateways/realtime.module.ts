import { Module, Global } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { RealtimeGateway } from './realtime.gateway';
import { WsJwtGuard } from '../guards/ws-jwt.guard';

// @Global — gateway jest współdzielony przez wszystkie moduły funkcjonalne,
// więc rejestrujemy go raz w AppModule zamiast importować w każdym feature module.
// JwtModule jest tu potrzebny, bo WsJwtGuard (używany przez RealtimeGateway
// do weryfikacji połączeń WebSocket) wstrzykuje JwtService.
@Global()
@Module({
  imports: [JwtModule.register({})],
  providers: [RealtimeGateway, WsJwtGuard],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}