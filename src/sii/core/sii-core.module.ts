import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SiiService } from '../sii.service';

@Module({
  imports: [ConfigModule],
  providers: [SiiService],
  exports: [SiiService],
})
export class SiiCoreModule {}