import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Fiscal')
@Controller('fiscal')
export class FiscalController {
  @Get('health')
  @ApiOperation({
    summary: 'Verifica que el runtime fiscal nativo este activo',
  })
  health() {
    return {
      engine: 'sii-engine',
      simpleApiEnabled: false,
      status: 'ok',
    };
  }
}
