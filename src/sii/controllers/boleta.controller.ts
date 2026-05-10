import {
  Controller,
  Post,
  Body,
  UploadedFiles,
  UseInterceptors,
  Logger,
  UseGuards,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiKeyGuard } from '../../auth/api-key.guard';
import { SiiService } from '../sii.service';
import { EmitirBoletaDto } from '../dto/emitir-boleta.dto';
import { ParseJsonPipe } from '../../common/pipes/parse-json.pipe';
import { SimpleApiResponseDto } from '../dto/simple-api-response.dto';
import { validateCertificadoFile, validateCafFile } from '../../common/utils/file-validation.util';
import { ApiTags, ApiOperation, ApiConsumes, ApiBody, ApiResponse, ApiSecurity } from '@nestjs/swagger';

@ApiTags('Boletas')
@ApiSecurity('x-api-key')
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
  @ApiResponse({ status: 201, description: 'Boleta emitida exitosamente.', type: SimpleApiResponseDto })
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
    @Body('datos', new ParseJsonPipe(EmitirBoletaDto)) dto: unknown,
    @UploadedFiles()
    files: {
      certificado?: Express.Multer.File[];
      caf?: Express.Multer.File[];
    },
  ) {
    const parsedDto = dto as EmitirBoletaDto;

    validateCertificadoFile(files?.certificado?.[0]);
    validateCafFile(files?.caf?.[0]);

    this.logger.log(`[POST /sii/boletas/emitir] Folio=${parsedDto.IdentificacionDTE?.Folio}`);

    return this.siiService.emitirBoleta(parsedDto, files.certificado[0], files.caf[0]);
  }
}
