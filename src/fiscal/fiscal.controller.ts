import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { FiscalCustodyService } from '../fiscal-storage/fiscal-custody.service';

@ApiTags('Fiscal')
@Controller('fiscal')
export class FiscalController {
  constructor(private readonly custodyService: FiscalCustodyService) {}

  @Get('health')
  @ApiOperation({
    summary: 'Verifica que el runtime fiscal nativo este activo',
  })
  health() {
    return {
      engine: 'sii-engine',
      custodyMode: this.custodyService.mode(),
      status: 'ok',
    };
  }
}
