import {
  Controller,
  Post,
  Body,
  Param,
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
import { ConsultaEstadoDteDto } from '../dto/consulta-estado-dte.dto';
import { ConsultaEstadoEnvioDto } from '../dto/consulta-estado-envio.dto';
import { ParseJsonPipe } from '../../common/pipes/parse-json.pipe';
import { validateCertificadoFile } from '../../common/utils/file-validation.util';
import { ApiTags, ApiOperation, ApiConsumes, ApiBody, ApiResponse } from '@nestjs/swagger';

@ApiTags('Consultas SII')
@UseGuards(ApiKeyGuard)
@Controller('sii/consultas')
export class ConsultaController {
  private readonly logger = new Logger(ConsultaController.name);

  constructor(private readonly siiService: SiiService) {}

  @Post('estado-envio/:trackId')
  @ApiOperation({ summary: 'Consultar estado de envío por TrackID' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        datos: { type: 'string', description: 'JSON de ConsultaEstadoEnvioDto (rutEmpresa, rutCertificado, passwordCertificado)' },
        certificado: { type: 'string', format: 'binary', description: '.pfx' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Estado del envío consultado.' })
  @ApiResponse({ status: 400, description: 'Datos o archivos faltantes/inválidos.' })
  @UseInterceptors(
    FileFieldsInterceptor([{ name: 'certificado', maxCount: 1 }], {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async consultarEstadoEnvio(
    @Param('trackId') trackId: string,
    @Body('datos', new ParseJsonPipe(ConsultaEstadoEnvioDto)) datos: ConsultaEstadoEnvioDto,
    @UploadedFiles() files: { certificado?: Express.Multer.File[] },
  ) {
    if (!trackId || trackId.trim().length === 0) {
      throw new BadRequestException('trackId es obligatorio en la URL');
    }

    validateCertificadoFile(files?.certificado?.[0]);

    this.logger.log(`[POST /sii/consultas/estado-envio/${trackId}]`);
    return this.siiService.consultarEstadoEnvio(
      datos.rutEmpresa,
      trackId,
      files.certificado[0],
      datos.rutCertificado,
      datos.passwordCertificado,
    );
  }

  @Post('estado-dte')
  @ApiOperation({ summary: 'Consultar estado de un DTE individual' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        datos: {
          type: 'string',
          description: 'JSON de ConsultaEstadoDteDto (rutEmpresa, rutReceptor, folio, tipoDte, total, fechaDte, rutCertificado, passwordCertificado)',
        },
        certificado: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Estado del DTE consultado.' })
  @ApiResponse({ status: 400, description: 'Datos o archivos faltantes/inválidos.' })
  @UseInterceptors(
    FileFieldsInterceptor([{ name: 'certificado', maxCount: 1 }], {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async consultarEstadoDte(
    @Body('datos', new ParseJsonPipe(ConsultaEstadoDteDto)) datos: ConsultaEstadoDteDto,
    @UploadedFiles() files: { certificado?: Express.Multer.File[] },
  ) {
    validateCertificadoFile(files?.certificado?.[0]);

    this.logger.log(
      `[POST /sii/consultas/estado-dte] folio=${datos.folio} tipo=${datos.tipoDte}`,
    );
    return this.siiService.consultarEstadoDte(
      datos.rutEmpresa,
      datos.rutReceptor,
      datos.folio,
      datos.tipoDte,
      datos.total,
      datos.fechaDte,
      files.certificado[0],
      datos.rutCertificado,
      datos.passwordCertificado,
    );
  }
}
