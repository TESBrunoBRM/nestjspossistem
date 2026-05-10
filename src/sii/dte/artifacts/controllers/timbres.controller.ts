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
import { TimbreRequestDto } from '../../../dto/dte/artifacts/timbre-request.dto';
import { SimpleApiResponseDto } from '../../../dto/shared/simple-api-response.dto';
import { TimbresService } from '../services/timbres.service';

@ApiTags('DTE - Muestras Impresas')
@ApiSecurity('x-api-key')
@UseGuards(ApiKeyGuard)
@Controller('sii/utilidades')
export class TimbresController {
  constructor(private readonly timbresService: TimbresService) {}

  @Post('timbre')
  @ApiOperation({ summary: 'Obtener Timbre Electrónico (PDF417)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        datos: { type: 'string', description: 'JSON de TimbreRequestDto' },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Timbre generado exitosamente.',
    type: SimpleApiResponseDto,
  })
  async obtener(
    @Body('datos', new ParseJsonPipe(TimbreRequestDto)) datos: unknown,
  ) {
    return this.timbresService.obtener(datos as TimbreRequestDto);
  }
}