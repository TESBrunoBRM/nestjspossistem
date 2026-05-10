import { Injectable, Logger } from '@nestjs/common';
import FormData from 'form-data';
import { RvdRequestDto } from '../../dto/utilidades-rvd.dto';
import { SiiService } from '../../sii.service';

@Injectable()
export class RvdService {
  private readonly logger = new Logger(RvdService.name);

  constructor(private readonly siiService: SiiService) {}

  generar(
    datosRvd: RvdRequestDto,
    certificadoFile: Express.Multer.File,
  ) {
    this.logger.log('Generando RVD');

    const form = new FormData();
    form.append('datos', JSON.stringify(datosRvd));
    form.append('certificado', certificadoFile.buffer, {
      filename: certificadoFile.originalname,
      contentType: 'application/x-pkcs12',
    });

    return this.siiService.postForm('/api/v1/dte/rvd', form);
  }
}
