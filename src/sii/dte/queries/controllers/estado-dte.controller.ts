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
import { ConsultaEstadoDteDto } from '../../../dto/dte/queries/consulta-estado-dte.dto';
import { EstadoDteService } from '../services/estado-dte.service';

@ApiTags('DTE - Consultas')
@ApiSecurity('x-api-key')
@UseGuards(ApiKeyGuard)
@Controller('sii/consultas')
export class EstadoDteController {
  private readonly logger = new Logger(EstadoDteController.name);

  constructor(private readonly estadoDteService: EstadoDteService) {}

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
  async consultar(
    @Body('datos', new ParseJsonPipe(ConsultaEstadoDteDto)) datos: unknown,
    @UploadedFiles() files: { certificado?: Express.Multer.File[] },
  ) {
    const parsedDatos = datos as ConsultaEstadoDteDto;

    validateCertificadoFile(files?.certificado?.[0]);

    this.logger.log(
      `[POST /sii/consultas/estado-dte] folio=${parsedDatos.folio} tipo=${parsedDatos.tipoDte}`,
    );
    return this.estadoDteService.consultar(
      parsedDatos.rutEmpresa,
      parsedDatos.rutReceptor,
      parsedDatos.folio,
      parsedDatos.tipoDte,
      parsedDatos.total,
      parsedDatos.fechaDte,
      files.certificado[0],
      parsedDatos.rutCertificado,
      parsedDatos.passwordCertificado,
    );
  }
}