import { Injectable, Logger } from '@nestjs/common';
import { SiiService } from '../../sii.service';

@Injectable()
export class RutService {
  private readonly logger = new Logger(RutService.name);

  constructor(private readonly siiService: SiiService) {}

  obtenerDatos(rut: string) {
    this.logger.log(`Obteniendo datos de empresa para RUT: ${rut}`);
    return this.siiService.get(`/api/v1/sii/datos_empresa/${rut}`);
  }
}
