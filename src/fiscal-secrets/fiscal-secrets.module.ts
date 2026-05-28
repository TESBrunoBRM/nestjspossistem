import { Module } from '@nestjs/common';
import { FiscalSecretsService } from './fiscal-secrets.service';

@Module({
  imports: [],
  providers: [FiscalSecretsService],
  exports: [FiscalSecretsService],
})
export class FiscalSecretsModule {}
