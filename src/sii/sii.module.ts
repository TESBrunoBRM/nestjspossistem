import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SiiCoreModule } from './core/sii-core.module';
import { DteModule } from './dte/dte.module';
import { FoliosModule } from './folios/folios.module';
import { PlatformModule } from './platform/platform.module';
import { RcvModule } from './rcv/rcv.module';
import { RutModule } from './rut/rut.module';

@Module({
  imports: [
    ConfigModule,
    SiiCoreModule,
    PlatformModule,
    DteModule,
    FoliosModule,
    RutModule,
    RcvModule,
  ],
  exports: [SiiCoreModule],
})
export class SiiModule {}

