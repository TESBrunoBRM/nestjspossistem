import { Module } from '@nestjs/common';
import { FiscalModule } from '../fiscal/fiscal.module';
import { FiscalDocumentsController } from './fiscal-documents.controller';
import { FiscalFoliosController } from './fiscal-folios.controller';
import { FiscalDocumentService } from './fiscal-document.service';
import { FiscalFoliosService } from './fiscal-folios.service';
import { FiscalFolioProvider } from './fiscal-folio.provider';
import { FiscalDocumentRepository } from './fiscal-document.repository';
import { FISCAL_FOLIO_PROVIDER } from './fiscal-documents.tokens';

@Module({
  imports: [FiscalModule],
  controllers: [FiscalDocumentsController, FiscalFoliosController],
  providers: [
    FiscalDocumentService,
    FiscalFoliosService,
    FiscalFolioProvider,
    {
      // Dev/in-memory default. Production must override this token with a
      // transactional provider backed by durable storage, locks and audit logs.
      provide: FISCAL_FOLIO_PROVIDER,
      useExisting: FiscalFolioProvider,
    },
    FiscalDocumentRepository,
  ],
  exports: [
    FiscalDocumentService,
    FiscalFoliosService,
    FISCAL_FOLIO_PROVIDER,
    FiscalFolioProvider,
    FiscalDocumentRepository,
  ],
})
export class FiscalDocumentsModule {}
