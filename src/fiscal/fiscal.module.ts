import { Module } from '@nestjs/common';
import { FiscalController } from './fiscal.controller';
import { FiscalContextResolver } from './fiscal-context.resolver';
import {
  FISCAL_ISSUER_STORE,
  LocalEnvFiscalIssuerStore,
} from './fiscal-issuer.store';
import { FISCAL_SIGNING_PROVIDER } from './fiscal-provider.tokens';
import { FiscalSigningProvider } from './fiscal-signing.provider';
import { FiscalTokenProvider } from './fiscal-token.provider';

@Module({
  imports: [],
  controllers: [FiscalController],
  providers: [
    FiscalContextResolver,
    LocalEnvFiscalIssuerStore,
    {
      provide: FISCAL_ISSUER_STORE,
      useExisting: LocalEnvFiscalIssuerStore,
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
    FiscalSigningProvider,
    FiscalTokenProvider,
  ],
})
export class FiscalModule {}
