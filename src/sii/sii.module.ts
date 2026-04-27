import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SiiService } from './sii.service';
import { BoletaController } from './controllers/boleta.controller';
import { FacturaController } from './controllers/factura.controller';
import { ConsultaController } from './controllers/consulta.controller';
import { SesionController } from './controllers/sesion.controller';
import { ContribuyenteController } from './controllers/contribuyente.controller';
import { UtilidadesController } from './controllers/utilidades.controller';

@Module({
  imports: [ConfigModule],
  controllers: [
    BoletaController,
    FacturaController,
    ConsultaController,
    SesionController,
    ContribuyenteController,
    UtilidadesController,
  ],
  providers: [SiiService],
  exports: [SiiService],
})
export class SiiModule {}

