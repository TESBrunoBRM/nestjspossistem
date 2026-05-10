import { Module } from '@nestjs/common';
import { SiiCoreModule } from '../../core/sii-core.module';
import { SobresEnvioController } from './controllers/sobres-envio.controller';
import { SobresEnvioService } from './services/sobres-envio.service';

@Module({
  imports: [SiiCoreModule],
  controllers: [SobresEnvioController],
  providers: [SobresEnvioService],
})
export class DteDispatchModule {}