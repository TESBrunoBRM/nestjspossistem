import { Injectable } from '@nestjs/common';
import { FoliosRequestDto } from '../../dto/utilidades-folios.dto';
import { SiiService } from '../../sii.service';

@Injectable()
export class GetFoliosService {
  constructor(private readonly siiService: SiiService) {}

  obtener(
    datosFolios: FoliosRequestDto,
    certificadoFile: Express.Multer.File,
  ) {
    return this.siiService.obtenerFolios(datosFolios, certificadoFile);
  }
}
