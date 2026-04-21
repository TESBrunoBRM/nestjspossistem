import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SiiController } from './sii.controller';
import { SiiService } from './sii.service';

@Module({
  imports: [ConfigModule],
  controllers: [SiiController],
  providers: [SiiService],
  exports: [SiiService],
})
export class SiiModule {}
