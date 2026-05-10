import { Injectable } from '@nestjs/common';
import { SiiService } from '../../../sii.service';
import { SobreEnvioRequestDto } from '../../../dto/utilidades-sobre-envio.dto';

@Injectable()
export class SobresEnvioService {
  constructor(private readonly siiService: SiiService) {}

  generar(
    datosEnvio: SobreEnvioRequestDto,
    certificadoFile: Express.Multer.File,
  ) {
    return this.siiService.generarSobreEnvio(datosEnvio, certificadoFile);
  }
}