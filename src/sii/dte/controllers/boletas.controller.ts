import {
  Body,
  Controller,
  Logger,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { ApiKeyGuard } from '../../../auth/api-key.guard';
import { ParseJsonPipe } from '../../../common/pipes/parse-json.pipe';
import {
  validateCafFile,
  validateCertificadoFile,
} from '../../../common/utils/file-validation.util';
import { EmitirBoletaDto } from '../../dto/dte/generation/emitir-boleta.dto';
import { SimpleApiResponseDto } from '../../dto/shared/simple-api-response.dto';
import { BoletasService } from '../services/boletas.service';

@ApiTags('DTE - Boletas')
@ApiSecurity('x-api-key')
@UseGuards(ApiKeyGuard)
@Controller('sii/boletas')
export class BoletasController {
  private readonly logger = new Logger(BoletasController.name);

  constructor(private readonly boletasService: BoletasService) {}

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
  @ApiResponse({
    status: 201,
    description: 'Boleta emitida exitosamente.',
    type: SimpleApiResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Datos o archivos faltantes/inválidos.',
  })
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'certificado', maxCount: 1 },
        { name: 'caf', maxCount: 1 },
      ],
      { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } },
    ),
  )
  async emitir(
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

    this.logger.log(
      `[POST /sii/boletas/emitir] Folio=${parsedDto.IdentificacionDTE?.Folio}`,
    );

    return this.boletasService.emitir(
      parsedDto,
      files.certificado[0],
      files.caf[0],
    );
  }
}