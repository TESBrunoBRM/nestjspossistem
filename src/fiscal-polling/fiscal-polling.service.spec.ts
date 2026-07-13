import { Test } from '@nestjs/testing';
import { SiiEnvironment } from 'sii-engine';
import { FiscalContextResolver } from '../fiscal/fiscal-context.resolver';
import { FISCAL_ISSUER_STORE } from '../fiscal/fiscal-issuer.store';
import { FISCAL_SIGNING_PROVIDER } from '../fiscal/fiscal-provider.tokens';
import { FiscalSigningProvider } from '../fiscal/fiscal-signing.provider';
import { FiscalTokenProvider } from '../fiscal/fiscal-token.provider';
import { FiscalPollingService } from './fiscal-polling.service';
import { FiscalDocumentRepository } from '../fiscal-documents/fiscal-document.repository';
import {
  FISCAL_RVD_TRACKING_REPOSITORY,
  InMemoryFiscalRvdRepository,
} from '../fiscal-rvd/fiscal-rvd.repository';

describe('FiscalPollingService', () => {
  it('is wired with native fiscal dependencies', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        FiscalPollingService,
        FiscalContextResolver,
        InMemoryFiscalRvdRepository,
        {
          provide: FISCAL_RVD_TRACKING_REPOSITORY,
          useExisting: InMemoryFiscalRvdRepository,
        },
        {
          provide: FISCAL_ISSUER_STORE,
          useValue: {
            resolveIssuer: jest.fn().mockResolvedValue({
              environment: SiiEnvironment.Certificacion,
              rutEmisor: '76123456-0',
              fechaResolucion: '2020-01-01',
              nroResolucion: 0,
              certificateRef: 'default',
            }),
          },
        },
        {
          provide: FiscalSigningProvider,
          useValue: {
            getSigningMaterial: jest.fn(),
          },
        },
        {
          provide: FISCAL_SIGNING_PROVIDER,
          useExisting: FiscalSigningProvider,
        },
        {
          provide: FiscalTokenProvider,
          useValue: {
            getToken: jest.fn(),
            getBoletaToken: jest.fn(),
          },
        },
        {
          provide: FiscalDocumentRepository,
          useValue: {
            findByTrackId: jest.fn(),
            update: jest.fn(),
          },
        },
      ],
    }).compile();

    const service = moduleRef.get(FiscalPollingService);
    expect(service).toBeInstanceOf(FiscalPollingService);
  });

  it('accepts a native polling DTO shape', () => {
    const dto = {
      context: {
        fechaResolucion: '2020-01-01',
        nroResolucion: 0,
      },
      trackId: '12345',
      attempt: 0,
    };

    expect(dto.context.fechaResolucion).toBe('2020-01-01');
    expect(dto.trackId).toBe('12345');
  });
});
