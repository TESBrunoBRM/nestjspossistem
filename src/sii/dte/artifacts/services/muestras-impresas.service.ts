import { Injectable } from '@nestjs/common';
import { SiiService } from '../../../sii.service';
import { MuestraImpresaRequestDto } from '../../../dto/utilidades-muestra-impresa.dto';

@Injectable()
export class MuestrasImpresasService {
  constructor(private readonly siiService: SiiService) {}

  obtener(datosImpresion: MuestraImpresaRequestDto) {
    return this.siiService.obtenerMuestraImpresa(datosImpresion);
  }
}