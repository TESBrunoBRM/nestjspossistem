import { Injectable } from '@nestjs/common';
import { SiiService } from '../../../sii.service';
import { TimbreRequestDto } from '../../../dto/utilidades-timbre.dto';

@Injectable()
export class TimbresService {
  constructor(private readonly siiService: SiiService) {}

  obtener(datosTimbre: TimbreRequestDto) {
    return this.siiService.obtenerTimbre(datosTimbre);
  }
}