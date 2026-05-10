import { Module } from '@nestjs/common';
import { SiiCoreModule } from '../../core/sii-core.module';
import { EstadoDteController } from './controllers/estado-dte.controller';
import { EstadoEnvioController } from './controllers/estado-envio.controller';
import { ValidadorDteController } from './controllers/validador-dte.controller';
import { EstadoDteService } from './services/estado-dte.service';
import { EstadoEnvioService } from './services/estado-envio.service';
import { ValidadorDteService } from './services/validador-dte.service';

@Module({
  imports: [SiiCoreModule],
  controllers: [
    EstadoEnvioController,
    EstadoDteController,
    ValidadorDteController,
  ],
  providers: [EstadoEnvioService, EstadoDteService, ValidadorDteService],
})
export class DteQueriesModule {}