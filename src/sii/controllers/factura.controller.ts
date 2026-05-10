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
import { EmitirFacturaDto } from '../dto/emitir-factura.dto';
import { EmitirNotaCreditoDto } from '../dto/emitir-nota-credito.dto';
import { ParseJsonPipe } from '../../common/pipes/parse-json.pipe';
import { SimpleApiResponseDto } from '../dto/simple-api-response.dto';
import { validateCertificadoFile, validateCafFile } from '../../common/utils/file-validation.util';
import { ApiTags, ApiOperation, ApiConsumes, ApiBody, ApiResponse, ApiSecurity } from '@nestjs/swagger';

@ApiTags('Facturas y Notas')
@ApiSecurity('x-api-key')
@UseGuards(ApiKeyGuard)
@Controller('sii/facturas')
export class FacturaController {
  private readonly logger = new Logger(FacturaController.name);

  constructor(private readonly siiService: SiiService) {}

  @Post('emitir')
  @ApiOperation({ summary: 'Emitir una Factura Electrónica (tipo 33)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        datos: { type: 'string', description: 'JSON stringificado de EmitirFacturaDto' },
        certificado: { type: 'string', format: 'binary', description: 'Archivo .pfx del certificado' },
        caf: { type: 'string', format: 'binary', description: 'Archivo .xml de folios tipo 33' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Factura emitida exitosamente.', type: SimpleApiResponseDto })
  @ApiResponse({ status: 400, description: 'Datos o archivos faltantes/inválidos.' })
  @UseInterceptors(
    FileFieldsInterceptor(
      [{ name: 'certificado', maxCount: 1 }, { name: 'caf', maxCount: 1 }],
      { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } },
    ),
  )
  async emitirFactura(
    @Body('datos', new ParseJsonPipe(EmitirFacturaDto)) dto: EmitirFacturaDto,
    @UploadedFiles() files: { certificado?: Express.Multer.File[]; caf?: Express.Multer.File[] },
  ) {
    validateCertificadoFile(files?.certificado?.[0]);
    validateCafFile(files?.caf?.[0]);

    this.logger.log(`[POST /sii/facturas/emitir] Folio=${dto.IdentificacionDTE?.Folio}`);
    return this.siiService.emitirFactura(dto, files.certificado[0], files.caf[0]);
  }

  @Post('nota-credito')
  @ApiOperation({ summary: 'Emitir Nota de Crédito/Débito' })
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
  @ApiResponse({ status: 201, description: 'Nota de Crédito/Débito emitida exitosamente.', type: SimpleApiResponseDto })
  @ApiResponse({ status: 400, description: 'Datos o archivos faltantes/inválidos.' })
  @UseInterceptors(
    FileFieldsInterceptor(
      [{ name: 'certificado', maxCount: 1 }, { name: 'caf', maxCount: 1 }],
      { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } },
    ),
  )
  async emitirNotaCredito(
    @Body('datos', new ParseJsonPipe(EmitirNotaCreditoDto)) dto: EmitirNotaCreditoDto,
    @UploadedFiles() files: { certificado?: Express.Multer.File[]; caf?: Express.Multer.File[] },
  ) {
    validateCertificadoFile(files?.certificado?.[0]);
    validateCafFile(files?.caf?.[0]);

    this.logger.log(`[POST /sii/facturas/nota-credito] Folio=${dto.IdentificacionDTE?.Folio}`);
    return this.siiService.emitirNotaCredito(dto, files.certificado[0], files.caf[0]);
  }
}
