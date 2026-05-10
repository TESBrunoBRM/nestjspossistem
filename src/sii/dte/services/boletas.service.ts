import { Injectable } from '@nestjs/common';
import { SiiService } from '../../sii.service';
import { EmitirBoletaDto } from '../../dto/emitir-boleta.dto';

@Injectable()
export class BoletasService {
  constructor(private readonly siiService: SiiService) {}

  emitir(
    dto: EmitirBoletaDto,
    certificadoFile: Express.Multer.File,
    cafFile: Express.Multer.File,
  ) {
    return this.siiService.emitirBoleta(dto, certificadoFile, cafFile);
  }
}