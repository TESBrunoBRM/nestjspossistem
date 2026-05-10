import { Injectable } from '@nestjs/common';
import { SiiService } from '../../../sii.service';

@Injectable()
export class EstadoDteService {
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
    return this.siiService.consultarEstadoDte(
      rutEmpresa,
      rutReceptor,
      folio,
      tipoDte,
      total,
      fechaDte,
      certificadoFile,
      rutCertificado,
      passwordCertificado,
    );
  }
}