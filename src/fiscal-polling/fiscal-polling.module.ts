import { Module } from '@nestjs/common';
import { FiscalModule } from '../fiscal/fiscal.module';
import { FiscalDocumentsModule } from '../fiscal-documents/fiscal-documents.module';
import { FiscalRvdModule } from '../fiscal-rvd/fiscal-rvd.module';
import { FiscalPollingController } from './fiscal-polling.controller';
import { FiscalPollingService } from './fiscal-polling.service';

@Module({
  imports: [FiscalModule, FiscalDocumentsModule, FiscalRvdModule],
  controllers: [FiscalPollingController],
  providers: [FiscalPollingService],
  exports: [FiscalPollingService],
})
export class FiscalPollingModule {}
