import { Module } from '@nestjs/common';
import { SiiCoreModule } from '../../core/sii-core.module';
import { MuestrasImpresasController } from './controllers/muestras-impresas.controller';
import { TimbresController } from './controllers/timbres.controller';
import { MuestrasImpresasService } from './services/muestras-impresas.service';
import { TimbresService } from './services/timbres.service';

@Module({
  imports: [SiiCoreModule],
  controllers: [TimbresController, MuestrasImpresasController],
  providers: [TimbresService, MuestrasImpresasService],
})
export class DteArtifactsModule {}