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
import { ParseJsonPipe } from '../../common/pipes/parse-json.pipe';
import { SimpleApiResponseDto } from '../dto/simple-api-response.dto';
import { SobreEnvioRequestDto } from '../dto/utilidades-sobre-envio.dto';
import { RvdRequestDto } from '../dto/utilidades-rvd.dto';
import { TimbreRequestDto } from '../dto/utilidades-timbre.dto';
import { MuestraImpresaRequestDto } from '../dto/utilidades-muestra-impresa.dto';
import { FoliosRequestDto } from '../dto/utilidades-folios.dto';
import { validateCertificadoFile } from '../../common/utils/file-validation.util';
import { ApiTags, ApiOperation, ApiConsumes, ApiBody, ApiResponse } from '@nestjs/swagger';

@ApiTags('Utilidades DTE')
@UseGuards(ApiKeyGuard)
@Controller('sii/utilidades')
export class UtilidadesController {
  private readonly logger = new Logger(UtilidadesController.name);

  constructor(private readonly siiService: SiiService) {}

  @Post('sobre-envio')
  @ApiOperation({ summary: 'Generar Sobre de Envío' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { properties: { datos: { type: 'string' }, certificado: { type: 'string', format: 'binary' } } } })
  @ApiResponse({ status: 201, description: 'Sobre generado exitosamente.', type: SimpleApiResponseDto })
  @UseInterceptors(FileFieldsInterceptor([{ name: 'certificado', maxCount: 1 }], { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }))
  async generarSobreEnvio(
    @Body('datos', new ParseJsonPipe(SobreEnvioRequestDto)) datos: SobreEnvioRequestDto,
    @UploadedFiles() files: { certificado?: Express.Multer.File[] },
  ) {
    validateCertificadoFile(files?.certificado?.[0]);
    this.logger.log('[POST /sii/utilidades/sobre-envio]');
    return this.siiService.generarSobreEnvio(datos, files.certificado[0]);
  }

  @Post('rvd')
  @ApiOperation({ summary: 'Generar Registro de Ventas Diarias (RVD)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { properties: { datos: { type: 'string' }, certificado: { type: 'string', format: 'binary' } } } })
  @ApiResponse({ status: 201, description: 'RVD generado exitosamente.', type: SimpleApiResponseDto })
  @UseInterceptors(FileFieldsInterceptor([{ name: 'certificado', maxCount: 1 }], { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }))
  async generarRvd(
    @Body('datos', new ParseJsonPipe(RvdRequestDto)) datos: RvdRequestDto,
    @UploadedFiles() files: { certificado?: Express.Multer.File[] },
  ) {
    validateCertificadoFile(files?.certificado?.[0]);
    this.logger.log('[POST /sii/utilidades/rvd]');
    return this.siiService.generarRvd(datos, files.certificado[0]);
  }

  @Post('timbre')
  @ApiOperation({ summary: 'Obtener Timbre Electrónico (PDF417)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        datos: { type: 'string', description: 'JSON de TimbreRequestDto' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Timbre generado exitosamente.', type: SimpleApiResponseDto })
  async obtenerTimbre(
    @Body('datos', new ParseJsonPipe(TimbreRequestDto)) datos: TimbreRequestDto,
  ) {
    this.logger.log('[POST /sii/utilidades/timbre]');
    return this.siiService.obtenerTimbre(datos);
  }

  @Post('muestra-impresa')
  @ApiOperation({ summary: 'Obtener Muestra Impresa (PDF)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        datos: { type: 'string', description: 'JSON de MuestraImpresaRequestDto' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'PDF generado exitosamente.', type: SimpleApiResponseDto })
  async obtenerMuestraImpresa(
    @Body('datos', new ParseJsonPipe(MuestraImpresaRequestDto)) datos: MuestraImpresaRequestDto,
  ) {
    this.logger.log('[POST /sii/utilidades/muestra-impresa]');
    return this.siiService.obtenerMuestraImpresa(datos);
  }

  @Post('validador')
  @ApiOperation({ summary: 'Validar XML de un DTE o Sobre' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        xml: { type: 'string', description: 'XML del DTE en base64' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Resultado de la validación.' })
  async validarDte(@Body('xml') xmlBase64: string) {
    if (!xmlBase64 || typeof xmlBase64 !== 'string' || xmlBase64.trim().length === 0) {
      throw new BadRequestException('Se requiere base64 en variable "xml"');
    }
    this.logger.log('[POST /sii/utilidades/validador]');
    return this.siiService.validarDte(xmlBase64);
  }

  @Post('folios')
  @ApiOperation({ summary: 'Obtener Folios (CAF) desde el SII' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { properties: { datos: { type: 'string' }, certificado: { type: 'string', format: 'binary' } } } })
  @ApiResponse({ status: 201, description: 'Folios obtenidos exitosamente.', type: SimpleApiResponseDto })
  @UseInterceptors(FileFieldsInterceptor([{ name: 'certificado', maxCount: 1 }], { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }))
  async obtenerFolios(
    @Body('datos', new ParseJsonPipe(FoliosRequestDto)) datos: FoliosRequestDto,
    @UploadedFiles() files: { certificado?: Express.Multer.File[] },
  ) {
    validateCertificadoFile(files?.certificado?.[0]);
    this.logger.log('[POST /sii/utilidades/folios]');
    return this.siiService.obtenerFolios(datos, files.certificado[0]);
  }
}
