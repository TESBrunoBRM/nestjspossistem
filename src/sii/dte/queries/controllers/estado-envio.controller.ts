import {
  BadRequestException,
  Body,
  Controller,
  Logger,
  Param,
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
import { validateCertificadoFile } from '../../../../common/utils/file-validation.util';
import { ConsultaEstadoEnvioDto } from '../../../dto/dte/queries/consulta-estado-envio.dto';
import { EstadoEnvioService } from '../services/estado-envio.service';

@ApiTags('DTE - Consultas')
@ApiSecurity('x-api-key')
@UseGuards(ApiKeyGuard)
@Controller('sii/consultas')
export class EstadoEnvioController {
  private readonly logger = new Logger(EstadoEnvioController.name);

  constructor(private readonly estadoEnvioService: EstadoEnvioService) {}

  @Post('estado-envio/:trackId')
  @ApiOperation({ summary: 'Consultar estado de envío por TrackID' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        datos: {
          type: 'string',
          description: 'JSON de ConsultaEstadoEnvioDto (rutEmpresa, rutCertificado, passwordCertificado)',
        },
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
  async consultar(
    @Param('trackId') trackId: string,
    @Body('datos', new ParseJsonPipe(ConsultaEstadoEnvioDto)) datos: unknown,
    @UploadedFiles() files: { certificado?: Express.Multer.File[] },
  ) {
    const parsedDatos = datos as ConsultaEstadoEnvioDto;

    if (!trackId || trackId.trim().length === 0) {
      throw new BadRequestException('trackId es obligatorio en la URL');
    }

    validateCertificadoFile(files?.certificado?.[0]);

    this.logger.log(`[POST /sii/consultas/estado-envio/${trackId}]`);
    return this.estadoEnvioService.consultar(
      parsedDatos.rutEmpresa,
      trackId,
      files.certificado[0],
      parsedDatos.rutCertificado,
      parsedDatos.passwordCertificado,
    );
  }
}