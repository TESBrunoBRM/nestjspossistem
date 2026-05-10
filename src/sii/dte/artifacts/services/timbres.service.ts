import { Injectable, Logger } from '@nestjs/common';
import FormData from 'form-data';
import { SiiService } from '../../../sii.service';
import { TimbreRequestDto } from '../../../dto/utilidades-timbre.dto';

@Injectable()
export class TimbresService {
  private readonly logger = new Logger(TimbresService.name);

  constructor(private readonly siiService: SiiService) {}

  obtener(datosTimbre: TimbreRequestDto) {
    this.logger.log('Solicitando imagen del timbre TED');

    const form = new FormData();
    form.append('datos', JSON.stringify(datosTimbre));

    return this.siiService.postForm('/api/v1/dte/timbre', form);
  }
}