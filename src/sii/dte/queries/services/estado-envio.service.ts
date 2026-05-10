import { Injectable, Logger } from '@nestjs/common';
import FormData from 'form-data';
import { SiiService } from '../../../sii.service';

@Injectable()
export class EstadoEnvioService {
  private readonly logger = new Logger(EstadoEnvioService.name);

  constructor(private readonly siiService: SiiService) {}

  consultar(
    rutEmpresa: string,
    trackId: string,
    certificadoFile: Express.Multer.File,
    rutCertificado: string,
    passwordCertificado: string,
  ) {
    this.logger.log(`Consultando estado trackId=${trackId}`);

    const form = new FormData();
    form.append(
      'datos',
      JSON.stringify({
        Certificado: { Rut: rutCertificado, Password: passwordCertificado },
        RutEmpresa: rutEmpresa,
        TrackId: trackId,
        Ambiente: this.siiService.getAmbiente(),
        ServidorBoletaREST: false,
      }),
    );
    form.append('certificado', certificadoFile.buffer, {
      filename: certificadoFile.originalname,
      contentType: 'application/x-pkcs12',
    });

    return this.siiService.postForm('/api/v1/dte/estado_envio', form);
  }
}