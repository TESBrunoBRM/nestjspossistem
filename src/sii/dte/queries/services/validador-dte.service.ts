import { Injectable, Logger } from '@nestjs/common';
import FormData from 'form-data';
import { SiiService } from '../../../sii.service';

@Injectable()
export class ValidadorDteService {
  private readonly logger = new Logger(ValidadorDteService.name);

  constructor(private readonly siiService: SiiService) {}

  validar(xmlBase64: string) {
    this.logger.log('Validando estructura de XML DTE');

    const form = new FormData();
    form.append('xml', xmlBase64);

    return this.siiService.postForm('/api/v1/dte/validar', form);
  }
}