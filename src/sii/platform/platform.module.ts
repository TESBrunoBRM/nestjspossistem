import { Module } from '@nestjs/common';
import { SiiCoreModule } from '../core/sii-core.module';
import { SimpleApiHealthController } from './controllers/simpleapi-health.controller';

@Module({
  imports: [SiiCoreModule],
  controllers: [SimpleApiHealthController],
})
export class PlatformModule {}