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
  ApiProduces,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { ApiKeyGuard } from '../../../auth/api-key.guard';
import { ParseJsonPipe } from '../../../common/pipes/parse-json.pipe';
import { validateCertificadoFile } from '../../../common/utils/file-validation.util';
import { FoliosRequestDto } from '../../dto/folios/get-folios.dto';
import { GetFoliosService } from '../services/get-folios.service';

@ApiTags('Folios')
@ApiSecurity('x-api-key')
@UseGuards(ApiKeyGuard)
@Controller('sii/utilidades')
export class GetFoliosController {
  private readonly logger = new Logger(GetFoliosController.name);

  constructor(private readonly getFoliosService: GetFoliosService) {}

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
          description:
            'JSON de FoliosRequestDto con RutEmpresa, TipoDTE, Cantidad, Ambiente y Certificado.{Rut, Password}',
          example:
            '{"RutEmpresa":"76269769-6","TipoDTE":33,"Cantidad":1,"Ambiente":0,"Certificado":{"Rut":"17096073-4","Password":"secreto"}}',
        },
        certificado: {
          type: 'string',
          format: 'binary',
          description:
            'Archivo .pfx del certificado digital usado para solicitar folios al SII',
        },
      },
    },
  })
  @ApiProduces('application/xml')
  @ApiResponse({
    status: 201,
    description:
      'Folios obtenidos exitosamente. SimpleAPI responde el CAF en XML.',
    schema: {
      type: 'string',
      example: '<?xml version="1.0"?><AUTORIZACION>...</AUTORIZACION>',
    },
  })
  @UseInterceptors(
    FileFieldsInterceptor(
      [{ name: 'certificado', maxCount: 1 }],
      { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } },
    ),
  )
  async obtener(
    @Body('datos', new ParseJsonPipe(FoliosRequestDto)) datos: unknown,
    @UploadedFiles() files: { certificado?: Express.Multer.File[] },
  ) {
    const parsedDatos = datos as FoliosRequestDto;

    validateCertificadoFile(files?.certificado?.[0]);
    this.logger.log('[POST /sii/utilidades/folios]');
    return this.getFoliosService.obtener(parsedDatos, files.certificado[0]);
  }
}