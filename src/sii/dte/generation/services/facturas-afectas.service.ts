import { Injectable } from '@nestjs/common';
import { EmitirFacturaDto } from '../../../dto/emitir-factura.dto';
import { SiiService } from '../../../sii.service';

@Injectable()
export class FacturasAfectasService {
  constructor(private readonly siiService: SiiService) {}

  emitir(
    dto: EmitirFacturaDto,
    certificadoFile: Express.Multer.File,
    cafFile: Express.Multer.File,
  ) {
    return this.siiService.emitirFactura(dto, certificadoFile, cafFile);
  }
}
