import {
  Controller,
  Post,
  Body,
  UploadedFiles,
  UseInterceptors,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiKeyGuard } from '../../auth/api-key.guard';
import { SiiService } from '../sii.service';
import { ApiTags, ApiOperation, ApiConsumes, ApiBody, ApiResponse } from '@nestjs/swagger';
import { ParseJsonPipe } from '../../common/pipes/parse-json.pipe';
import { SimpleApiResponseDto } from '../dto/simple-api-response.dto';

@ApiTags('Utilidades DTE')
@UseGuards(ApiKeyGuard)
@Controller('sii/utilidades')
export class UtilidadesController {
  constructor(private readonly siiService: SiiService) {}

  @Post('sobre-envio')
  @ApiOperation({ summary: 'Generar Sobre de Envío' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { properties: { datos: { type: 'string' }, certificado: { type: 'string', format: 'binary' } } } })
  @ApiResponse({ status: 201, description: 'Sobre generado exitosamente.', type: SimpleApiResponseDto })
  @UseInterceptors(FileFieldsInterceptor([{ name: 'certificado', maxCount: 1 }], { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }))
  async generarSobreEnvio(
    @Body('datos', new ParseJsonPipe(Object, { strict: false })) datos: any,
    @UploadedFiles() files: { certificado?: Express.Multer.File[] },
  ) {
    if (!files?.certificado?.[0]) throw new BadRequestException('Se requiere "certificado" (.pfx)');
    return this.siiService.generarSobreEnvio(datos, files.certificado[0]);
  }

  @Post('rvd')
  @ApiOperation({ summary: 'Generar Registro de Ventas Diarias (RVD)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { properties: { datos: { type: 'string' }, certificado: { type: 'string', format: 'binary' } } } })
  @ApiResponse({ status: 201, description: 'RVD generado exitosamente.', type: SimpleApiResponseDto })
  @UseInterceptors(FileFieldsInterceptor([{ name: 'certificado', maxCount: 1 }], { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }))
  async generarRvd(
    @Body('datos', new ParseJsonPipe(Object, { strict: false })) datos: any,
    @UploadedFiles() files: { certificado?: Express.Multer.File[] },
  ) {
    if (!files?.certificado?.[0]) throw new BadRequestException('Se requiere "certificado" (.pfx)');
    return this.siiService.generarRvd(datos, files.certificado[0]);
  }

  @Post('timbre')
  @ApiOperation({ summary: 'Obtener Timbre Electrónico (PDF417)' })
  async obtenerTimbre(@Body('datos') datos: any) {
    if (!datos) throw new BadRequestException('Se requieren datos para generar el timbre');
    return this.siiService.obtenerTimbre(datos);
  }

  @Post('muestra-impresa')
  @ApiOperation({ summary: 'Obtener Muestra Impresa (PDF)' })
  async obtenerMuestraImpresa(@Body('datos') datos: any) {
    if (!datos) throw new BadRequestException('Se requieren datos para el PDF');
    return this.siiService.obtenerMuestraImpresa(datos);
  }

  @Post('validador')
  @ApiOperation({ summary: 'Validar XML de un DTE o Sobre' })
  async validarDte(@Body('xml') xmlBase64: string) {
    if (!xmlBase64) throw new BadRequestException('Se requiere base64 en variable "xml"');
    return this.siiService.validarDte(xmlBase64);
  }

  @Post('folios')
  @ApiOperation({ summary: 'Obtener Folios (CAF) desde el SII' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { properties: { datos: { type: 'string' }, certificado: { type: 'string', format: 'binary' } } } })
  @ApiResponse({ status: 201, description: 'Folios obtenidos exitosamente.', type: SimpleApiResponseDto })
  @UseInterceptors(FileFieldsInterceptor([{ name: 'certificado', maxCount: 1 }], { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }))
  async obtenerFolios(
    @Body('datos', new ParseJsonPipe(Object, { strict: false })) datos: any,
    @UploadedFiles() files: { certificado?: Express.Multer.File[] },
  ) {
    if (!files?.certificado?.[0]) throw new BadRequestException('Se requiere "certificado" (.pfx)');
    return this.siiService.obtenerFolios(datos, files.certificado[0]);
  }
}
