import { Test, TestingModule } from '@nestjs/testing';
import {
  parseCaf,
  SiiEnvironment,
  TipoDTE,
  type CafAcquisitionRequest,
  type CafAcquisitionProvider,
  type IssuerContext,
} from 'sii-engine';
import { FiscalContextResolver } from '../fiscal/fiscal-context.resolver';
import { FISCAL_ISSUER_STORE } from '../fiscal/fiscal-issuer.store';
import { FISCAL_FOLIO_PROVIDER } from '../fiscal-documents/fiscal-documents.tokens';
import type { IssuerContextDto } from '../fiscal/dto/issuer-context.dto';
import { InMemoryCafAcquisitionRepository } from './fiscal-caf-acquisition.repository';
import { FiscalCafAcquisitionService } from './fiscal-caf-acquisition.service';
import {
  FISCAL_CAF_ACQUISITION_PROVIDER,
  FISCAL_CAF_ACQUISITION_REPOSITORY,
} from './fiscal-caf-acquisition.tokens';
import type { FolioAvailabilityProvider } from './fiscal-folio-availability.types';
import { TEST_CAF_AUTHORIZATION_DATE } from '../../test/support/fiscal-fixtures';

const context: IssuerContext = {
  environment: SiiEnvironment.Certificacion,
  rutEmisor: '76123456-0',
  fechaResolucion: '2020-01-01',
  nroResolucion: 80,
  certificateRef: 'default',
};

const contextDto = {
  fechaResolucion: '2020-01-01',
  nroResolucion: 80,
};

describe('FiscalCafAcquisitionService', () => {
  let service: FiscalCafAcquisitionService;
  let acquisitionProvider: jest.Mocked<CafAcquisitionProvider>;
  let requestCafMock: jest.MockedFunction<CafAcquisitionProvider['requestCaf']>;
  let queryAvailableFoliosMock: jest.MockedFunction<
    FolioAvailabilityProvider['queryAvailableFolios']
  >;
  let folioProvider: { addCafXml: jest.Mock };

  beforeEach(async () => {
    requestCafMock = jest
      .fn()
      .mockImplementation((request: CafAcquisitionRequest) =>
        Promise.resolve({
          requestId: 'caf-request-1',
          status: 'manual_action_required',
          method: 'sii_portal_automation',
          context: request.context,
          tipoDTE: request.tipoDTE,
          quantityRequested: request.quantity,
          requestedAt: new Date('2026-05-26T12:00:00.000Z'),
          detail: 'Adapter pendiente de configurar',
          retryable: false,
          rawResponse: 'cookie=session; token=secret',
        }),
      );
    queryAvailableFoliosMock = jest.fn().mockImplementation((request) =>
      Promise.resolve({
        requestId: 'folio-availability-1',
        status: 'available',
        method: 'sii_portal_availability_scraping',
        context: request.context,
        tipoDTE: request.tipoDTE,
        quantityProbed: 1,
        availableFolios: 10,
        maxAuthorizedFolios: 20,
        requestedAt: new Date('2026-05-26T12:00:00.000Z'),
        completedAt: new Date('2026-05-26T12:01:00.000Z'),
        retryable: false,
      }),
    );
    acquisitionProvider = {
      requestCaf: requestCafMock,
      queryAvailableFolios: queryAvailableFoliosMock,
    } as jest.Mocked<CafAcquisitionProvider> &
      jest.Mocked<FolioAvailabilityProvider>;
    folioProvider = { addCafXml: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FiscalCafAcquisitionService,
        FiscalContextResolver,
        InMemoryCafAcquisitionRepository,
        {
          provide: FISCAL_CAF_ACQUISITION_REPOSITORY,
          useExisting: InMemoryCafAcquisitionRepository,
        },
        {
          provide: FISCAL_CAF_ACQUISITION_PROVIDER,
          useValue: acquisitionProvider,
        },
        {
          provide: FISCAL_FOLIO_PROVIDER,
          useValue: folioProvider,
        },
        {
          provide: FISCAL_ISSUER_STORE,
          useValue: {
            resolveIssuer: jest.fn((lookup?: IssuerContextDto) => ({
              ...context,
              tenantId: lookup?.tenantId,
              merchantId: lookup?.merchantId,
              branchId: lookup?.branchId,
              fechaResolucion:
                lookup?.fechaResolucion ?? context.fechaResolucion,
              nroResolucion: lookup?.nroResolucion ?? context.nroResolucion,
            })),
          },
        },
      ],
    }).compile();

    service = module.get(FiscalCafAcquisitionService);
  });

  it('returns a public manual-action result without leaking raw portal data', async () => {
    const result = await service.requestCaf({
      context: contextDto,
      tipoDTE: TipoDTE.BoletaElectronica,
      quantity: 10,
    });

    expect(result).toMatchObject({
      requestId: 'caf-request-1',
      status: 'manual_action_required',
      method: 'sii_portal_automation',
      rutEmisor: '76123456-0',
      tipoDTE: TipoDTE.BoletaElectronica,
      quantityRequested: 10,
      retryable: false,
    });
    expectPublicPayloadSafe(result);
  });

  it('uses idempotency key to avoid duplicated portal requests', async () => {
    const dto = {
      context: contextDto,
      tipoDTE: TipoDTE.BoletaElectronica,
      quantity: 10,
      idempotencyKey: 'same-request',
    };

    const first = await service.requestCaf(dto);
    const second = await service.requestCaf(dto);

    expect(first.requestId).toBe('caf-request-1');
    expect(second.requestId).toBe('caf-request-1');
    expect(requestCafMock).toHaveBeenCalledTimes(1);
  });

  it('requests all three folios when the portal only allows three', async () => {
    queryAvailableFoliosMock.mockResolvedValueOnce({
      requestId: 'folio-availability-3',
      status: 'available',
      method: 'sii_portal_availability_scraping',
      context,
      tipoDTE: TipoDTE.FacturaElectronica,
      quantityProbed: 1,
      availableFolios: 3,
      maxAuthorizedFolios: 3,
      requestedAt: new Date('2026-05-26T12:00:00.000Z'),
      retryable: false,
    });

    const result = await service.requestCaf({
      context: contextDto,
      tipoDTE: TipoDTE.FacturaElectronica,
      quantity: 50,
    });

    expect(requestCafMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tipoDTE: TipoDTE.FacturaElectronica,
        quantity: 3,
      }),
    );
    expect(result.quantityRequested).toBe(3);
  });

  it('caps a large portal allowance at fifty folios', async () => {
    queryAvailableFoliosMock.mockResolvedValueOnce({
      requestId: 'folio-availability-1000',
      status: 'available',
      method: 'sii_portal_availability_scraping',
      context,
      tipoDTE: TipoDTE.FacturaElectronica,
      quantityProbed: 1,
      availableFolios: 1000,
      maxAuthorizedFolios: 1000,
      requestedAt: new Date('2026-05-26T12:00:00.000Z'),
      retryable: false,
    });

    const result = await service.requestCaf({
      context: contextDto,
      tipoDTE: TipoDTE.FacturaElectronica,
      quantity: 1000,
    });

    expect(requestCafMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tipoDTE: TipoDTE.FacturaElectronica,
        quantity: 50,
      }),
    );
    expect(result.quantityRequested).toBe(50);
  });

  it('falls back to one folio when portal availability counters are inconclusive', async () => {
    queryAvailableFoliosMock.mockResolvedValueOnce({
      requestId: 'folio-availability-zero',
      status: 'available',
      method: 'sii_portal_availability_scraping',
      context,
      tipoDTE: TipoDTE.FacturaElectronica,
      quantityProbed: 1,
      availableFolios: 0,
      maxAuthorizedFolios: 0,
      requestedAt: new Date('2026-05-26T12:00:00.000Z'),
      retryable: false,
    });

    await service.requestCaf({
      context: contextDto,
      tipoDTE: TipoDTE.FacturaElectronica,
      quantity: 50,
    });

    expect(requestCafMock).toHaveBeenCalledWith(
      expect.objectContaining({ quantity: 1 }),
    );
  });

  it('imports downloaded CAF internally and returns only public CAF metadata', async () => {
    const rawCaf = cafXml('76123456-0', 500, 550);
    const caf = parseCaf(rawCaf);
    requestCafMock.mockResolvedValueOnce({
      requestId: 'caf-request-2',
      status: 'downloaded',
      method: 'sii_portal_automation',
      context,
      tipoDTE: TipoDTE.BoletaElectronica,
      quantityRequested: 50,
      requestedAt: new Date('2026-05-26T12:00:00.000Z'),
      completedAt: new Date('2026-05-26T12:01:00.000Z'),
      caf,
      rawResponse: '<html>cookie=secret</html>',
    });

    const result = await service.requestCaf({
      context: contextDto,
      tipoDTE: TipoDTE.BoletaElectronica,
      quantity: 50,
    });

    expect(folioProvider.addCafXml).toHaveBeenCalledWith(context, rawCaf);
    expect(result).toMatchObject({
      requestId: 'caf-request-2',
      status: 'imported',
      caf: {
        rutEmisor: '76123456-0',
        tipoDTE: TipoDTE.BoletaElectronica,
        rangeStart: 500,
        rangeEnd: 550,
      },
    });
    expectPublicPayloadSafe(result);
  });

  it('imports downloaded CAF 33 internally for factura electronica requests', async () => {
    const rawCaf = cafXml('76123456-0', 700, 705, TipoDTE.FacturaElectronica);
    const caf = parseCaf(rawCaf);
    requestCafMock.mockResolvedValueOnce({
      requestId: 'caf-request-33',
      status: 'downloaded',
      method: 'sii_portal_automation',
      context,
      tipoDTE: TipoDTE.FacturaElectronica,
      quantityRequested: 1,
      requestedAt: new Date('2026-05-26T12:00:00.000Z'),
      completedAt: new Date('2026-05-26T12:01:00.000Z'),
      caf,
    });

    const result = await service.requestCaf({
      context: contextDto,
      tipoDTE: TipoDTE.FacturaElectronica,
      quantity: 1,
    });

    expect(folioProvider.addCafXml).toHaveBeenCalledWith(context, rawCaf);
    expect(result).toMatchObject({
      requestId: 'caf-request-33',
      status: 'imported',
      tipoDTE: TipoDTE.FacturaElectronica,
      caf: {
        rutEmisor: '76123456-0',
        tipoDTE: TipoDTE.FacturaElectronica,
        rangeStart: 700,
        rangeEnd: 705,
      },
    });
    expectPublicPayloadSafe(result);
  });

  it('returns public SII availability for CAF 33 folios', async () => {
    const result = await service.queryFolioAvailability({
      context: contextDto,
      tipoDTE: TipoDTE.FacturaElectronica,
    });

    expect(queryAvailableFoliosMock).toHaveBeenCalledWith({
      context,
      tipoDTE: TipoDTE.FacturaElectronica,
      method: 'sii_portal_availability_scraping',
    });
    expect(result).toMatchObject({
      requestId: 'folio-availability-1',
      status: 'available',
      method: 'sii_portal_availability_scraping',
      rutEmisor: '76123456-0',
      tipoDTE: TipoDTE.FacturaElectronica,
      quantityProbed: 1,
      availableFolios: 10,
      maxAuthorizedFolios: 20,
      retryable: false,
    });
    expectPublicPayloadSafe(result);
  });
});

function expectPublicPayloadSafe(body: unknown): void {
  const serialized = JSON.stringify(body);

  expect(serialized).not.toMatch(
    /rawResponse|rawXml|RSASK|<CAF|PRIVATE KEY|privateKey|token|password|cookie/i,
  );
}

function cafXml(
  rutEmisor: string,
  start: number,
  end: number,
  tipoDTE = TipoDTE.BoletaElectronica,
): string {
  return `<?xml version="1.0" encoding="ISO-8859-1"?>
<AUTORIZACION>
  <CAF version="1.0">
    <DA>
      <RE>${rutEmisor}</RE>
      <RS>EMISOR TEST</RS>
      <TD>${tipoDTE}</TD>
      <RNG><D>${start}</D><H>${end}</H></RNG>
      <FA>${TEST_CAF_AUTHORIZATION_DATE}</FA>
      <RSAPK><M>00</M><E>03</E></RSAPK>
      <IDK>1</IDK>
    </DA>
    <FRMA algoritmo="SHA1withRSA">firma</FRMA>
  </CAF>
  <RSASK>private-key</RSASK>
  <RSAPUBK>public-key</RSAPUBK>
</AUTORIZACION>`;
}
