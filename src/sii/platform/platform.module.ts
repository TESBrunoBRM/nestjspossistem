import { Module } from '@nestjs/common';
import { SiiCoreModule } from '../core/sii-core.module';
import { SimpleApiHealthController } from './controllers/simpleapi-health.controller';
import { SimpleApiHealthService } from './services/simpleapi-health.service';

@Module({
  imports: [SiiCoreModule],
  controllers: [SimpleApiHealthController],
  providers: [SimpleApiHealthService],
})
export class PlatformModule {}