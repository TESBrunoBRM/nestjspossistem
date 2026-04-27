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
import { EmitirFacturaDto } from '../dto/emitir-factura.dto';
import { EmitirNotaCreditoDto } from '../dto/emitir-nota-credito.dto';
import { ApiTags, ApiOperation, ApiConsumes, ApiBody, ApiResponse } from '@nestjs/swagger';

@ApiTags('Facturas y Notas')
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
  @ApiResponse({ status: 201, description: 'Factura emitida exitosamente.' })
  @UseInterceptors(
    FileFieldsInterceptor(
      [{ name: 'certificado', maxCount: 1 }, { name: 'caf', maxCount: 1 }],
      { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } },
    ),
  )
  async emitirFactura(
    @Body('datos') datosRaw: string,
    @UploadedFiles() files: { certificado?: Express.Multer.File[]; caf?: Express.Multer.File[] },
  ) {
    if (!files?.certificado?.[0]) throw new BadRequestException('Falta certificado .pfx');
    if (!files?.caf?.[0]) throw new BadRequestException('Falta caf .xml');
    if (!datosRaw) throw new BadRequestException('Falta campo datos');

    let dto: EmitirFacturaDto;
    try {
      dto = JSON.parse(datosRaw) as EmitirFacturaDto;
    } catch {
      throw new BadRequestException('datos no es JSON válido');
    }

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
  @UseInterceptors(
    FileFieldsInterceptor(
      [{ name: 'certificado', maxCount: 1 }, { name: 'caf', maxCount: 1 }],
      { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } },
    ),
  )
  async emitirNotaCredito(
    @Body('datos') datosRaw: string,
    @UploadedFiles() files: { certificado?: Express.Multer.File[]; caf?: Express.Multer.File[] },
  ) {
    if (!files?.certificado?.[0]) throw new BadRequestException('Falta certificado .pfx');
    if (!files?.caf?.[0]) throw new BadRequestException('Falta caf .xml');
    if (!datosRaw) throw new BadRequestException('Falta campo datos JSON');

    let dto: EmitirNotaCreditoDto;
    try {
      dto = JSON.parse(datosRaw) as EmitirNotaCreditoDto;
    } catch {
      throw new BadRequestException('datos no es un JSON válido');
    }

    return this.siiService.emitirNotaCredito(dto, files.certificado[0], files.caf[0]);
  }
}
