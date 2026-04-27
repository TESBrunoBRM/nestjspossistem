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
import { ApiTags, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';

@ApiTags('Utilidades DTE')
@UseGuards(ApiKeyGuard)
@Controller('sii/utilidades')
export class UtilidadesController {
  constructor(private readonly siiService: SiiService) {}

  @Post('sobre-envio')
  @ApiOperation({ summary: 'Generar Sobre de Envío' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { properties: { datos: { type: 'string' }, certificado: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(FileFieldsInterceptor([{ name: 'certificado', maxCount: 1 }], { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }))
  async generarSobreEnvio(
    @Body('datos') datosRaw: string,
    @UploadedFiles() files: { certificado?: Express.Multer.File[] },
  ) {
    if (!files?.certificado?.[0]) throw new BadRequestException('Se requiere "certificado" (.pfx)');
    if (!datosRaw) throw new BadRequestException('Se requiere el campo "datos" JSON');
    return this.siiService.generarSobreEnvio(JSON.parse(datosRaw), files.certificado[0]);
  }

  @Post('rvd')
  @ApiOperation({ summary: 'Generar Registro de Ventas Diarias (RVD)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { properties: { datos: { type: 'string' }, certificado: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(FileFieldsInterceptor([{ name: 'certificado', maxCount: 1 }], { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }))
  async generarRvd(
    @Body('datos') datosRaw: string,
    @UploadedFiles() files: { certificado?: Express.Multer.File[] },
  ) {
    if (!files?.certificado?.[0]) throw new BadRequestException('Se requiere "certificado" (.pfx)');
    if (!datosRaw) throw new BadRequestException('Se requiere el campo "datos" JSON');
    return this.siiService.generarRvd(JSON.parse(datosRaw), files.certificado[0]);
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
  @UseInterceptors(FileFieldsInterceptor([{ name: 'certificado', maxCount: 1 }], { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }))
  async obtenerFolios(
    @Body('datos') datosRaw: string,
    @UploadedFiles() files: { certificado?: Express.Multer.File[] },
  ) {
    if (!files?.certificado?.[0]) throw new BadRequestException('Se requiere "certificado" (.pfx)');
    if (!datosRaw) throw new BadRequestException('Se requiere el campo "datos" JSON');
    return this.siiService.obtenerFolios(JSON.parse(datosRaw), files.certificado[0]);
  }
}
