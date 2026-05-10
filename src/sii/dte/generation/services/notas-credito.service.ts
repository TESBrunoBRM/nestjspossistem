import { Injectable } from '@nestjs/common';
import { EmitirNotaCreditoDto } from '../../../dto/emitir-nota-credito.dto';
import { SiiService } from '../../../sii.service';

@Injectable()
export class NotasCreditoService {
  constructor(private readonly siiService: SiiService) {}

  emitir(
    dto: EmitirNotaCreditoDto,
    certificadoFile: Express.Multer.File,
    cafFile: Express.Multer.File,
  ) {
    return this.siiService.emitirNotaCredito(dto, certificadoFile, cafFile);
  }
}
