import { Module } from '@nestjs/common';
import { FiscalController } from './fiscal.controller';
import { FiscalContextResolver } from './fiscal-context.resolver';
import {
  CompositeFiscalIssuerStore,
  FISCAL_ISSUER_STORE,
  LocalEnvFiscalIssuerStore,
} from './fiscal-issuer.store';
import { FISCAL_SIGNING_PROVIDER } from './fiscal-provider.tokens';
import { FiscalSigningProvider } from './fiscal-signing.provider';
import { FiscalTokenProvider } from './fiscal-token.provider';
import { FiscalStorageModule } from '../fiscal-storage/fiscal-storage.module';
import { FiscalIssuersController } from './fiscal-issuers.controller';
import { FiscalIssuerAdminService } from './fiscal-issuer-admin.service';

@Module({
  imports: [FiscalStorageModule],
  controllers: [FiscalController, FiscalIssuersController],
  providers: [
    FiscalContextResolver,
    LocalEnvFiscalIssuerStore,
    CompositeFiscalIssuerStore,
    FiscalIssuerAdminService,
    {
      provide: FISCAL_ISSUER_STORE,
      useExisting: CompositeFiscalIssuerStore,
    },
    FiscalSigningProvider,
    {
      provide: FISCAL_SIGNING_PROVIDER,
      useExisting: FiscalSigningProvider,
    },
    FiscalTokenProvider,
  ],
  exports: [
    FISCAL_ISSUER_STORE,
    FISCAL_SIGNING_PROVIDER,
    FiscalContextResolver,
    FiscalIssuerAdminService,
    FiscalSigningProvider,
    FiscalTokenProvider,
  ],
})
export class FiscalModule {}
