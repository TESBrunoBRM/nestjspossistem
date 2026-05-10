import { Module } from '@nestjs/common';
import { SiiCoreModule } from '../core/sii-core.module';
import { RvdController } from './controllers/rvd.controller';
import { RvdService } from './services/rvd.service';

@Module({
  imports: [SiiCoreModule],
  controllers: [RvdController],
  providers: [RvdService],
})
export class RcvModule {}