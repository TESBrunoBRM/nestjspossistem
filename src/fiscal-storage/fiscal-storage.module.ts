import { Module } from '@nestjs/common';
import { FiscalCustodyService } from './fiscal-custody.service';

@Module({
  providers: [FiscalCustodyService],
  exports: [FiscalCustodyService],
})
export class FiscalStorageModule {}
