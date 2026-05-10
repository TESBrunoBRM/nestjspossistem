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
import { ApiKeyGuard } from '../../../../auth/api-key.guard';
import { ParseJsonPipe } from '../../../../common/pipes/parse-json.pipe';
import {
  validateCafFile,
  validateCertificadoFile,
} from '../../../../common/utils/file-validation.util';
import { EmitirNotaCreditoDto } from '../../../dto/dte/generation/emitir-nota-credito.dto';
import { SimpleApiResponseDto } from '../../../dto/shared/simple-api-response.dto';
import { NotasCreditoService } from '../services/notas-credito.service';

@ApiTags('DTE - Notas de Crédito y Débito')
@ApiSecurity('x-api-key')
@UseGuards(ApiKeyGuard)
@Controller('sii/facturas')
export class NotasCreditoController {
  private readonly logger = new Logger(NotasCreditoController.name);

  constructor(private readonly notasCreditoService: NotasCreditoService) {}

  @Post('nota-credito')
  @ApiOperation({ summary: 'Emitir Nota de Crédito o Débito' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        datos: { type: 'string', description: 'JSON de EmitirNotaCreditoDto' },
        certificado: { type: 'string', format: 'binary', description: '.pfx' },
        caf: { type: 'string', format: 'binary', description: '.xml de folios' },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Nota de Crédito/Débito emitida exitosamente.',
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
    @Body('datos', new ParseJsonPipe(EmitirNotaCreditoDto)) dto: unknown,
    @UploadedFiles()
    files: {
      certificado?: Express.Multer.File[];
      caf?: Express.Multer.File[];
    },
  ) {
    const parsedDto = dto as EmitirNotaCreditoDto;

    validateCertificadoFile(files?.certificado?.[0]);
    validateCafFile(files?.caf?.[0]);

    this.logger.log(
      `[POST /sii/facturas/nota-credito] Folio=${parsedDto.IdentificacionDTE?.Folio}`,
    );

    return this.notasCreditoService.emitir(
      parsedDto,
      files.certificado[0],
      files.caf[0],
    );
  }
}