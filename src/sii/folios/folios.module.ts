import { Module } from '@nestjs/common';
import { SiiCoreModule } from '../core/sii-core.module';
import { GetFoliosController } from './controllers/get-folios.controller';
import { GetFoliosService } from './services/get-folios.service';

@Module({
  imports: [SiiCoreModule],
  controllers: [GetFoliosController],
  providers: [GetFoliosService],
})
export class FoliosModule {}