import { Module } from '@nestjs/common';
import { FiscalModule } from '../fiscal/fiscal.module';
import { FiscalRvdController } from './fiscal-rvd.controller';
import { FiscalRvdService } from './fiscal-rvd.service';
import { FiscalRvdSequenceProvider } from './fiscal-rvd-sequence.provider';
import {
  FISCAL_RVD_TRACKING_REPOSITORY,
  InMemoryFiscalRvdRepository,
} from './fiscal-rvd.repository';

@Module({
  imports: [FiscalModule],
  controllers: [FiscalRvdController],
  providers: [
    FiscalRvdService,
    FiscalRvdSequenceProvider,
    InMemoryFiscalRvdRepository,
    {
      provide: FISCAL_RVD_TRACKING_REPOSITORY,
      useExisting: InMemoryFiscalRvdRepository,
    },
  ],
  exports: [
    FiscalRvdService,
    FiscalRvdSequenceProvider,
    FISCAL_RVD_TRACKING_REPOSITORY,
    InMemoryFiscalRvdRepository,
  ],
})
export class FiscalRvdModule {}
