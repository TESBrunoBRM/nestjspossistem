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
import {
  ApiTags,
  ApiOperation,
  ApiConsumes,
  ApiBody,
  ApiResponse,
  ApiSecurity,
  ApiProduces,
} from '@nestjs/swagger';

@ApiTags('Utilidades DTE')
@ApiSecurity('x-api-key')
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
    @Body('datos', new ParseJsonPipe(SobreEnvioRequestDto)) datos: unknown,
    @UploadedFiles() files: { certificado?: Express.Multer.File[] },
  ) {
    const parsedDatos = datos as SobreEnvioRequestDto;

    validateCertificadoFile(files?.certificado?.[0]);
    this.logger.log('[POST /sii/utilidades/sobre-envio]');
    return this.siiService.generarSobreEnvio(parsedDatos, files.certificado[0]);
  }

  @Post('rvd')
  @ApiOperation({ summary: 'Generar Registro de Ventas Diarias (RVD)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { properties: { datos: { type: 'string' }, certificado: { type: 'string', format: 'binary' } } } })
  @ApiResponse({ status: 201, description: 'RVD generado exitosamente.', type: SimpleApiResponseDto })
  @UseInterceptors(FileFieldsInterceptor([{ name: 'certificado', maxCount: 1 }], { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }))
  async generarRvd(
    @Body('datos', new ParseJsonPipe(RvdRequestDto)) datos: unknown,
    @UploadedFiles() files: { certificado?: Express.Multer.File[] },
  ) {
    const parsedDatos = datos as RvdRequestDto;

    validateCertificadoFile(files?.certificado?.[0]);
    this.logger.log('[POST /sii/utilidades/rvd]');
    return this.siiService.generarRvd(parsedDatos, files.certificado[0]);
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
    @Body('datos', new ParseJsonPipe(TimbreRequestDto)) datos: unknown,
  ) {
    const parsedDatos = datos as TimbreRequestDto;

    this.logger.log('[POST /sii/utilidades/timbre]');
    return this.siiService.obtenerTimbre(parsedDatos);
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
    @Body('datos', new ParseJsonPipe(MuestraImpresaRequestDto)) datos: unknown,
  ) {
    const parsedDatos = datos as MuestraImpresaRequestDto;

    this.logger.log('[POST /sii/utilidades/muestra-impresa]');
    return this.siiService.obtenerMuestraImpresa(parsedDatos);
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
  @ApiBody({
    schema: {
      type: 'object',
      required: ['datos', 'certificado'],
      properties: {
        datos: {
          type: 'string',
          description: 'JSON de FoliosRequestDto con RutEmpresa, TipoDTE, Cantidad, Ambiente y Certificado.{Rut, Password}',
          example: '{"RutEmpresa":"76269769-6","TipoDTE":33,"Cantidad":1,"Ambiente":0,"Certificado":{"Rut":"17096073-4","Password":"secreto"}}',
        },
        certificado: {
          type: 'string',
          format: 'binary',
          description: 'Archivo .pfx del certificado digital usado para solicitar folios al SII',
        },
      },
    },
  })
  @ApiProduces('application/xml')
  @ApiResponse({
    status: 201,
    description: 'Folios obtenidos exitosamente. SimpleAPI responde el CAF en XML.',
    schema: {
      type: 'string',
      example: '<?xml version="1.0"?><AUTORIZACION>...</AUTORIZACION>',
    },
  })
  @UseInterceptors(FileFieldsInterceptor([{ name: 'certificado', maxCount: 1 }], { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }))
  async obtenerFolios(
    @Body('datos', new ParseJsonPipe(FoliosRequestDto)) datos: unknown,
    @UploadedFiles() files: { certificado?: Express.Multer.File[] },
  ) {
    const parsedDatos = datos as FoliosRequestDto;

    validateCertificadoFile(files?.certificado?.[0]);
    this.logger.log('[POST /sii/utilidades/folios]');
    return this.siiService.obtenerFolios(parsedDatos, files.certificado[0]);
  }
}
