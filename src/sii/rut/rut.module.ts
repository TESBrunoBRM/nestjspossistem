import { Module } from '@nestjs/common';
import { SiiCoreModule } from '../core/sii-core.module';
import { RutController } from './controllers/rut.controller';
import { RutService } from './services/rut.service';

@Module({
  imports: [SiiCoreModule],
  controllers: [RutController],
  providers: [RutService],
})
export class RutModule {}