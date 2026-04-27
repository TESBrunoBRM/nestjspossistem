import {
  Controller,
  Post,
  Body,
  Param,
  UploadedFiles,
  UseInterceptors,
  BadRequestException,
  Query,
  UseGuards,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiKeyGuard } from '../../auth/api-key.guard';
import { SiiService } from '../sii.service';
import { ApiTags, ApiOperation, ApiConsumes, ApiBody, ApiResponse, ApiQuery } from '@nestjs/swagger';

@ApiTags('Consultas SII')
@UseGuards(ApiKeyGuard)
@Controller('sii/consultas')
export class ConsultaController {
  constructor(private readonly siiService: SiiService) {}

  @Post('estado-envio/:trackId')
  @ApiOperation({ summary: 'Consultar estado de envío por TrackID' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        rutEmpresa: { type: 'string' },
        rutCertificado: { type: 'string' },
        passwordCertificado: { type: 'string' },
        certificado: { type: 'string', format: 'binary', description: '.pfx' },
      },
    },
  })
  @UseInterceptors(
    FileFieldsInterceptor([{ name: 'certificado', maxCount: 1 }], {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async consultarEstadoEnvio(
    @Param('trackId') trackId: string,
    @Body('rutEmpresa') rutEmpresa: string,
    @Body('rutCertificado') rutCertificado: string,
    @Body('passwordCertificado') passwordCertificado: string,
    @UploadedFiles() files: { certificado?: Express.Multer.File[] },
  ) {
    if (!files?.certificado?.[0]) throw new BadRequestException('Falta archivo certificado .pfx');
    if (!rutEmpresa || !rutCertificado || !passwordCertificado) {
      throw new BadRequestException('Faltan datos de empresa o certificado');
    }

    return this.siiService.consultarEstadoEnvio(
      rutEmpresa,
      trackId,
      files.certificado[0],
      rutCertificado,
      passwordCertificado,
    );
  }

  @Post('estado-dte')
  @ApiOperation({ summary: 'Consultar estado de un DTE individual' })
  @ApiConsumes('multipart/form-data')
  @ApiQuery({ name: 'rutEmpresa', required: true })
  @ApiQuery({ name: 'rutReceptor', required: true })
  @ApiQuery({ name: 'folio', required: true })
  @ApiQuery({ name: 'tipoDte', required: true })
  @ApiQuery({ name: 'total', required: true })
  @ApiQuery({ name: 'fechaDte', required: true })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        rutCertificado: { type: 'string' },
        passwordCertificado: { type: 'string' },
        certificado: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(
    FileFieldsInterceptor([{ name: 'certificado', maxCount: 1 }], {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async consultarEstadoDte(
    @Query('rutEmpresa') rutEmpresa: string,
    @Query('rutReceptor') rutReceptor: string,
    @Query('folio') folio: string,
    @Query('tipoDte') tipoDte: string,
    @Query('total') total: string,
    @Query('fechaDte') fechaDte: string,
    @Body('rutCertificado') rutCertificado: string,
    @Body('passwordCertificado') passwordCertificado: string,
    @UploadedFiles() files: { certificado?: Express.Multer.File[] },
  ) {
    if (!files?.certificado?.[0]) throw new BadRequestException('Falta certificado .pfx');

    return this.siiService.consultarEstadoDte(
      rutEmpresa,
      rutReceptor,
      parseInt(folio, 10),
      parseInt(tipoDte, 10),
      parseInt(total, 10),
      fechaDte,
      files.certificado[0],
      rutCertificado,
      passwordCertificado,
    );
  }
}
