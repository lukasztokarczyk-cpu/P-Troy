import { Module, Global } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';

// @Global — gateway jest współdzielony przez wszystkie moduły funkcjonalne,
// więc rejestrujemy go raz w AppModule zamiast importować w każdym feature module
@Global()
@Module({
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
