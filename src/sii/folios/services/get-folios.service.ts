import { Injectable, Logger } from '@nestjs/common';
import FormData from 'form-data';
import { FoliosRequestDto } from '../../dto/utilidades-folios.dto';
import { SiiService } from '../../sii.service';

@Injectable()
export class GetFoliosService {
  private readonly logger = new Logger(GetFoliosService.name);

  constructor(private readonly siiService: SiiService) {}

  obtener(
    datosFolios: FoliosRequestDto,
    certificadoFile: Express.Multer.File,
  ) {
    this.logger.log(
      `Solicitando folios CAF al SII tipo=${datosFolios.TipoDTE} cantidad=${datosFolios.Cantidad}`,
    );

    const form = new FormData();
    form.append(
      'input',
      JSON.stringify({
        RutCertificado: datosFolios.Certificado.Rut,
        Password: datosFolios.Certificado.Password,
        RutEmpresa: datosFolios.RutEmpresa,
        Ambiente: datosFolios.Ambiente,
      }),
    );
    form.append('files', certificadoFile.buffer, {
      filename: certificadoFile.originalname,
      contentType: 'application/x-pkcs12',
    });

    return this.siiService.postForm(
      `/api/folios/get/${datosFolios.TipoDTE}/${datosFolios.Cantidad}`,
      form,
      {
        baseURL: this.siiService.getFoliosBaseUrl(),
        responseType: 'text',
        timeout: 120000,
      },
    );
  }
}
