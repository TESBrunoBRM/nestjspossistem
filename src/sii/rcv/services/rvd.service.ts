import { Injectable } from '@nestjs/common';
import { RvdRequestDto } from '../../dto/utilidades-rvd.dto';
import { SiiService } from '../../sii.service';

@Injectable()
export class RvdService {
  constructor(private readonly siiService: SiiService) {}

  generar(
    datosRvd: RvdRequestDto,
    certificadoFile: Express.Multer.File,
  ) {
    return this.siiService.generarRvd(datosRvd, certificadoFile);
  }
}
