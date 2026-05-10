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
import { ApiKeyGuard } from '../../../auth/api-key.guard';
import { ParseJsonPipe } from '../../../common/pipes/parse-json.pipe';
import { validateCertificadoFile } from '../../../common/utils/file-validation.util';
import { RvdRequestDto } from '../../dto/rcv/rvd-request.dto';
import { SimpleApiResponseDto } from '../../dto/shared/simple-api-response.dto';
import { RvdService } from '../services/rvd.service';

@ApiTags('Registro Compras y Ventas')
@ApiSecurity('x-api-key')
@UseGuards(ApiKeyGuard)
@Controller('sii/utilidades')
export class RvdController {
  private readonly logger = new Logger(RvdController.name);

  constructor(private readonly rvdService: RvdService) {}

  @Post('rvd')
  @ApiOperation({ summary: 'Generar Registro de Ventas Diarias (RVD)' })
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
    description: 'RVD generado exitosamente.',
    type: SimpleApiResponseDto,
  })
  @UseInterceptors(
    FileFieldsInterceptor(
      [{ name: 'certificado', maxCount: 1 }],
      { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } },
    ),
  )
  async generar(
    @Body('datos', new ParseJsonPipe(RvdRequestDto)) datos: unknown,
    @UploadedFiles() files: { certificado?: Express.Multer.File[] },
  ) {
    const parsedDatos = datos as RvdRequestDto;

    validateCertificadoFile(files?.certificado?.[0]);
    this.logger.log('[POST /sii/utilidades/rvd]');
    return this.rvdService.generar(parsedDatos, files.certificado[0]);
  }
}