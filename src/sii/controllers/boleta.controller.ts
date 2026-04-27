import {
  Controller,
  Post,
  Body,
  UploadedFiles,
  UseInterceptors,
  BadRequestException,
  Logger,
  UseGuards,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiKeyGuard } from '../../auth/api-key.guard';
import { SiiService } from '../sii.service';
import { EmitirBoletaDto } from '../dto/emitir-boleta.dto';
import { ApiTags, ApiOperation, ApiConsumes, ApiBody, ApiResponse } from '@nestjs/swagger';

@ApiTags('Boletas')
@UseGuards(ApiKeyGuard)
@Controller('sii/boletas')
export class BoletaController {
  private readonly logger = new Logger(BoletaController.name);

  constructor(private readonly siiService: SiiService) {}

  @Post('emitir')
  @ApiOperation({ summary: 'Emitir una Boleta Electrónica (tipo 39 o 41)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        datos: {
          type: 'string',
          description: 'JSON stringificado de EmitirBoletaDto',
        },
        certificado: {
          type: 'string',
          format: 'binary',
          description: 'Archivo .pfx del certificado digital',
        },
        caf: {
          type: 'string',
          format: 'binary',
          description: 'Archivo .xml de folios autorizados por el SII',
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Boleta emitida exitosamente.' })
  @ApiResponse({ status: 400, description: 'Datos o archivos faltantes/inválidos.' })
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'certificado', maxCount: 1 },
        { name: 'caf', maxCount: 1 },
      ],
      { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } },
    ),
  )
  async emitirBoleta(
    @Body('datos') datosRaw: string,
    @UploadedFiles()
    files: {
      certificado?: Express.Multer.File[];
      caf?: Express.Multer.File[];
    },
  ) {
    if (!files?.certificado?.[0]) {
      throw new BadRequestException('Se requiere el archivo "certificado" (.pfx)');
    }
    if (!files?.caf?.[0]) {
      throw new BadRequestException('Se requiere el archivo "caf" (.xml) con los folios');
    }
    if (!datosRaw) {
      throw new BadRequestException('Se requiere el campo "datos" con el JSON de la boleta');
    }

    let dto: EmitirBoletaDto;
    try {
      dto = JSON.parse(datosRaw) as EmitirBoletaDto;
    } catch {
      throw new BadRequestException('El campo "datos" no es un JSON válido');
    }

    this.logger.log(`[POST /sii/boletas/emitir] Folio=${dto.IdentificacionDTE?.Folio}`);

    return this.siiService.emitirBoleta(dto, files.certificado[0], files.caf[0]);
  }
}
