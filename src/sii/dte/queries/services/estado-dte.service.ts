import { Injectable, Logger } from '@nestjs/common';
import FormData from 'form-data';
import { SiiService } from '../../../sii.service';

@Injectable()
export class EstadoDteService {
  private readonly logger = new Logger(EstadoDteService.name);

  constructor(private readonly siiService: SiiService) {}

  consultar(
    rutEmpresa: string,
    rutReceptor: string,
    folio: number,
    tipoDte: number,
    total: number,
    fechaDte: string,
    certificadoFile: Express.Multer.File,
    rutCertificado: string,
    passwordCertificado: string,
  ) {
    this.logger.log(`Consultando estado DTE folio=${folio} tipo=${tipoDte}`);

    const form = new FormData();
    form.append(
      'datos',
      JSON.stringify({
        Certificado: { Rut: rutCertificado, Password: passwordCertificado },
        RutEmpresa: rutEmpresa,
        RutReceptor: rutReceptor,
        Folio: folio,
        Tipo: tipoDte,
        Total: total,
        FechaDTE: fechaDte,
        Ambiente: this.siiService.getAmbiente(),
        ServidorBoletaREST: tipoDte === 39 || tipoDte === 41,
      }),
    );
    form.append('certificado', certificadoFile.buffer, {
      filename: certificadoFile.originalname,
      contentType: 'application/x-pkcs12',
    });

    return this.siiService.postForm('/api/v1/dte/estado_dte', form);
  }
}