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
import { validateCertificadoFile } from '../../../../common/utils/file-validation.util';
import { SobreEnvioRequestDto } from '../../../dto/dte/dispatch/sobre-envio-request.dto';
import { SimpleApiResponseDto } from '../../../dto/shared/simple-api-response.dto';
import { SobresEnvioService } from '../services/sobres-envio.service';

@ApiTags('DTE - Envío')
@ApiSecurity('x-api-key')
@UseGuards(ApiKeyGuard)
@Controller('sii/utilidades')
export class SobresEnvioController {
  private readonly logger = new Logger(SobresEnvioController.name);

  constructor(private readonly sobresEnvioService: SobresEnvioService) {}

  @Post('sobre-envio')
  @ApiOperation({ summary: 'Generar Sobre de Envío' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      properties: {
        datos: { type: 'string' },
        certificado: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Sobre generado exitosamente.',
    type: SimpleApiResponseDto,
  })
  @UseInterceptors(
    FileFieldsInterceptor(
      [{ name: 'certificado', maxCount: 1 }],
      { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } },
    ),
  )
  async generar(
    @Body('datos', new ParseJsonPipe(SobreEnvioRequestDto)) datos: unknown,
    @UploadedFiles() files: { certificado?: Express.Multer.File[] },
  ) {
    const parsedDatos = datos as SobreEnvioRequestDto;

    validateCertificadoFile(files?.certificado?.[0]);
    this.logger.log('[POST /sii/utilidades/sobre-envio]');
    return this.sobresEnvioService.generar(parsedDatos, files.certificado[0]);
  }
}