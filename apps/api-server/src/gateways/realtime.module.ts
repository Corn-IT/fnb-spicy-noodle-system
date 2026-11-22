import { Global, Module } from '@nestjs/common';
import { configuredJwtModule } from '../common/utils/jwt-module-options';
import { PosSocketGateway } from './pos-socket.gateway';

@Global()
@Module({
  imports: [configuredJwtModule()],
  providers: [PosSocketGateway],
  exports: [PosSocketGateway],
})
export class RealtimeModule {}
