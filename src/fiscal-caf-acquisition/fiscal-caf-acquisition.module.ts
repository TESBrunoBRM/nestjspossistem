import { Module } from '@nestjs/common';
import { FiscalModule } from '../fiscal/fiscal.module';
import { FiscalDocumentsModule } from '../fiscal-documents/fiscal-documents.module';
import { FiscalCafAcquisitionController } from './fiscal-caf-acquisition.controller';
import { InMemoryCafAcquisitionRepository } from './fiscal-caf-acquisition.repository';
import { FiscalCafAcquisitionService } from './fiscal-caf-acquisition.service';
import {
  FISCAL_CAF_ACQUISITION_PROVIDER,
  FISCAL_CAF_ACQUISITION_REPOSITORY,
} from './fiscal-caf-acquisition.tokens';
import { SiiPortalFoliosAdapter } from './sii-portal-folios.adapter';

@Module({
  imports: [FiscalModule, FiscalDocumentsModule],
  controllers: [FiscalCafAcquisitionController],
  providers: [
    FiscalCafAcquisitionService,
    SiiPortalFoliosAdapter,
    {
      // Default safe adapter. Production should override this token with the
      // real portal automation backed by secure tenant credential storage.
      provide: FISCAL_CAF_ACQUISITION_PROVIDER,
      useExisting: SiiPortalFoliosAdapter,
    },
    InMemoryCafAcquisitionRepository,
    {
      provide: FISCAL_CAF_ACQUISITION_REPOSITORY,
      useExisting: InMemoryCafAcquisitionRepository,
    },
  ],
  exports: [
    FiscalCafAcquisitionService,
    FISCAL_CAF_ACQUISITION_PROVIDER,
    FISCAL_CAF_ACQUISITION_REPOSITORY,
  ],
})
export class FiscalCafAcquisitionModule {}
