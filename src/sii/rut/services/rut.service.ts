import { Injectable } from '@nestjs/common';
import { SiiService } from '../../sii.service';

@Injectable()
export class RutService {
  constructor(private readonly siiService: SiiService) {}

  obtenerDatos(rut: string) {
    return this.siiService.obtenerDatosEmpresa(rut);
  }
}
