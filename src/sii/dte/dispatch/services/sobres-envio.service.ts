import { Injectable, Logger } from '@nestjs/common';
import FormData from 'form-data';
import { SiiService } from '../../../sii.service';
import { SobreEnvioRequestDto } from '../../../dto/utilidades-sobre-envio.dto';

@Injectable()
export class SobresEnvioService {
  private readonly logger = new Logger(SobresEnvioService.name);

  constructor(private readonly siiService: SiiService) {}

  generar(
    datosEnvio: SobreEnvioRequestDto,
    certificadoFile: Express.Multer.File,
  ) {
    this.logger.log('Generando sobre de envío SII');

    const form = new FormData();
    form.append('datos', JSON.stringify(datosEnvio));
    form.append('certificado', certificadoFile.buffer, {
      filename: certificadoFile.originalname,
      contentType: 'application/x-pkcs12',
    });

    return this.siiService.postForm('/api/v1/dte/sobre_envio', form);
  }
}