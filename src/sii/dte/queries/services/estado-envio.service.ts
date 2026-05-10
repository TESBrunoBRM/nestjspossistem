import { Injectable } from '@nestjs/common';
import { SiiService } from '../../../sii.service';

@Injectable()
export class EstadoEnvioService {
  constructor(private readonly siiService: SiiService) {}

  consultar(
    rutEmpresa: string,
    trackId: string,
    certificadoFile: Express.Multer.File,
    rutCertificado: string,
    passwordCertificado: string,
  ) {
    return this.siiService.consultarEstadoEnvio(
      rutEmpresa,
      trackId,
      certificadoFile,
      rutCertificado,
      passwordCertificado,
    );
  }
}