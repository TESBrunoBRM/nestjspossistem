import { Injectable, Logger } from '@nestjs/common';
import FormData from 'form-data';
import { SiiService } from '../../../sii.service';
import { MuestraImpresaRequestDto } from '../../../dto/utilidades-muestra-impresa.dto';

@Injectable()
export class MuestrasImpresasService {
  private readonly logger = new Logger(MuestrasImpresasService.name);

  constructor(private readonly siiService: SiiService) {}

  obtener(datosImpresion: MuestraImpresaRequestDto) {
    this.logger.log('Solicitando generación de PDF Muestra Impresa');

    const form = new FormData();
    form.append('datos', JSON.stringify(datosImpresion));

    return this.siiService.postForm('/api/v1/dte/pdf', form);
  }
}