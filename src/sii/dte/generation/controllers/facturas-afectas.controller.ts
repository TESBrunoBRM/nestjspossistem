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
import { EmitirFacturaDto } from '../../../dto/dte/generation/emitir-factura.dto';
import { SimpleApiResponseDto } from '../../../dto/shared/simple-api-response.dto';
import { FacturasAfectasService } from '../services/facturas-afectas.service';

@ApiTags('DTE - Facturas')
@ApiSecurity('x-api-key')
@UseGuards(ApiKeyGuard)
@Controller('sii/facturas')
export class FacturasAfectasController {
  private readonly logger = new Logger(FacturasAfectasController.name);

  constructor(
    private readonly facturasAfectasService: FacturasAfectasService,
  ) {}

  @Post('emitir')
  @ApiOperation({
    summary:
      'Emitir una Factura Electrónica (tipo 33, 34, 46, 52, 56 o 61 según payload)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        datos: {
          type: 'string',
          description: 'JSON stringificado de EmitirFacturaDto',
        },
        certificado: {
          type: 'string',
          format: 'binary',
          description: 'Archivo .pfx del certificado',
        },
        caf: {
          type: 'string',
          format: 'binary',
          description: 'Archivo .xml de folios del tipo DTE correspondiente',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Factura emitida exitosamente.',
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
    @Body('datos', new ParseJsonPipe(EmitirFacturaDto)) dto: unknown,
    @UploadedFiles()
    files: {
      certificado?: Express.Multer.File[];
      caf?: Express.Multer.File[];
    },
  ) {
    const parsedDto = dto as EmitirFacturaDto;

    validateCertificadoFile(files?.certificado?.[0]);
    validateCafFile(files?.caf?.[0]);

    this.logger.log(
      `[POST /sii/facturas/emitir] Folio=${parsedDto.IdentificacionDTE?.Folio}`,
    );

    return this.facturasAfectasService.emitir(
      parsedDto,
      files.certificado[0],
      files.caf[0],
    );
  }
}