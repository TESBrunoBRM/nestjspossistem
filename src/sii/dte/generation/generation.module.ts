import { Module } from '@nestjs/common';
import { SiiCoreModule } from '../../core/sii-core.module';
import { BoletasController } from '../controllers/boletas.controller';
import { BoletasService } from '../services/boletas.service';
import { FacturasAfectasController } from './controllers/facturas-afectas.controller';
import { NotasCreditoController } from './controllers/notas-credito.controller';
import { FacturasAfectasService } from './services/facturas-afectas.service';
import { NotasCreditoService } from './services/notas-credito.service';

@Module({
  imports: [SiiCoreModule],
  controllers: [
    BoletasController,
    FacturasAfectasController,
    NotasCreditoController,
  ],
  providers: [BoletasService, FacturasAfectasService, NotasCreditoService],
})
export class DteGenerationModule {}