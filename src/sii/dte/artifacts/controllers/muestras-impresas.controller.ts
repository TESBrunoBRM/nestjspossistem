import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { ApiKeyGuard } from '../../../../auth/api-key.guard';
import { ParseJsonPipe } from '../../../../common/pipes/parse-json.pipe';
import { MuestraImpresaRequestDto } from '../../../dto/dte/artifacts/muestra-impresa-request.dto';
import { SimpleApiResponseDto } from '../../../dto/shared/simple-api-response.dto';
import { MuestrasImpresasService } from '../services/muestras-impresas.service';

@ApiTags('DTE - Muestras Impresas')
@ApiSecurity('x-api-key')
@UseGuards(ApiKeyGuard)
@Controller('sii/utilidades')
export class MuestrasImpresasController {
  constructor(
    private readonly muestrasImpresasService: MuestrasImpresasService,
  ) {}

  @Post('muestra-impresa')
  @ApiOperation({ summary: 'Obtener Muestra Impresa (PDF)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        datos: {
          type: 'string',
          description: 'JSON de MuestraImpresaRequestDto',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'PDF generado exitosamente.',
    type: SimpleApiResponseDto,
  })
  async obtener(
    @Body('datos', new ParseJsonPipe(MuestraImpresaRequestDto)) datos: unknown,
  ) {
    return this.muestrasImpresasService.obtener(
      datos as MuestraImpresaRequestDto,
    );
  }
}