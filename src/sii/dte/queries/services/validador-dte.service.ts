import { Injectable } from '@nestjs/common';
import { SiiService } from '../../../sii.service';

@Injectable()
export class ValidadorDteService {
  constructor(private readonly siiService: SiiService) {}

  validar(xmlBase64: string) {
    return this.siiService.validarDte(xmlBase64);
  }
}