/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return */
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import forge from 'node-forge';
import {
  parseCaf,
  SiiEnvironment,
  SiiSendError,
  TipoDTE,
  type IssuerContext,
} from 'sii-engine';
import { FiscalDocumentService } from './fiscal-document.service';
import { FiscalDocumentRepository } from './fiscal-document.repository';
import { FiscalFolioProvider } from './fiscal-folio.provider';
import { FISCAL_FOLIO_PROVIDER } from './fiscal-documents.tokens';
import { FiscalContextResolver } from '../fiscal/fiscal-context.resolver';
import { FISCAL_ISSUER_STORE } from '../fiscal/fiscal-issuer.store';
import { FISCAL_SIGNING_PROVIDER } from '../fiscal/fiscal-provider.tokens';
import { FiscalSigningProvider } from '../fiscal/fiscal-signing.provider';
import { FiscalTokenProvider } from '../fiscal/fiscal-token.provider';
import { FiscalCustodyService } from '../fiscal-storage/fiscal-custody.service';
import { FiscalPollingService } from '../fiscal-polling/fiscal-polling.service';
import { FiscalRvdService } from '../fiscal-rvd/fiscal-rvd.service';
import { FiscalRvdSequenceProvider } from '../fiscal-rvd/fiscal-rvd-sequence.provider';
import {
  FISCAL_RVD_TRACKING_REPOSITORY,
  InMemoryFiscalRvdRepository,
} from '../fiscal-rvd/fiscal-rvd.repository';

function createTestCert(): { certificatePem: string; privateKeyPem: string } {
  const keys = forge.pki.rsa.generateKeyPair(1024);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date('2026-01-01');
  cert.validity.notAfter = new Date('2099-01-01');

  const attrs = [
    { type: '2.5.4.5', value: '12345678-5' },
    { name: 'commonName', value: 'Firmante 12345678-5' },
    { name: 'countryName', value: 'CL' },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey);

  return {
    certificatePem: forge.pki.certificateToPem(cert),
    privateKeyPem: forge.pki.privateKeyToPem(keys.privateKey),
  };
}

const generatedCert = createTestCert();

const mockBoletaSend = jest.fn();
const mockBoletaQueryStatus = jest.fn();
const mockBoletaSendRvd = jest.fn();
const mockLegacySend = jest.fn();
const mockLegacyQueryStatus = jest.fn();
const mockLegacyQueryDteStatus = jest.fn();

// Mock the Sii Clients from sii-engine
jest.mock('sii-engine', () => {
  const original = jest.requireActual('sii-engine');
  return {
    ...original,
    BoletaSiiClient: jest.fn().mockImplementation(() => ({
      send: mockBoletaSend,
      queryStatus: mockBoletaQueryStatus,
      sendRvd: mockBoletaSendRvd,
    })),
    LegacySiiClient: jest.fn().mockImplementation(() => ({
      send: mockLegacySend,
      queryStatus: mockLegacyQueryStatus,
      queryDteStatus: mockLegacyQueryDteStatus,
    })),
  };
});

const context: IssuerContext = {
  environment: SiiEnvironment.Certificacion,
  rutEmisor: '11111111-1',
  fechaResolucion: '2020-01-01',
  nroResolucion: 80,
  certificateRef: 'default',
};

const mockCert = {
  privateKeyPem: generatedCert.privateKeyPem,
  certificatePem: generatedCert.certificatePem,
  rutFirmante: '12345678-5',
  nombre: 'REPRESENTANTE TEST',
  expiresAt: new Date(Date.now() + 1000000),
  fingerprintSha256: 'abc123fingerprint',
};

const mockToken = {
  token: 'mocktoken123',
  obtainedAt: new Date(),
  environment: SiiEnvironment.Certificacion,
};

describe('Fiscal Services with Mock Transport', () => {
  let docService: FiscalDocumentService;
  let pollingService: FiscalPollingService;
  let rvdService: FiscalRvdService;
  let repository: FiscalDocumentRepository;
  let folioProvider: FiscalFolioProvider;

  beforeEach(async () => {
    mockBoletaSend.mockReset().mockResolvedValue({
      trackId: 'mock-track-123',
      status: 'EPR',
      rawResponse: '<xml>mock</xml>',
    });
    mockBoletaQueryStatus.mockReset().mockResolvedValue({
      trackId: 'mock-track-123',
      status: 'SOK',
      rawResponse: '<xml>mock</xml>',
    });
    mockBoletaSendRvd.mockReset().mockResolvedValue({
      trackId: 'mock-rvd-track-456',
      status: 'EPR',
      rawResponse: '<xml>mock</xml>',
    });
    mockLegacyQueryStatus.mockReset().mockResolvedValue({
      trackId: 'mock-track-123',
      status: 'SOK',
      rawResponse: '<xml>mock</xml>',
    });
    mockLegacySend.mockReset().mockResolvedValue({
      trackId: 'mock-legacy-track-333',
      status: 'EPR',
      rawResponse: '<xml>mock</xml>',
    });
    mockLegacyQueryDteStatus.mockReset().mockResolvedValue({
      tipoDTE: TipoDTE.FacturaElectronica,
      folio: 100,
      rutEmisor: '11111111-1',
      status: 'DOK',
      glosa: 'Documento recibido',
      rawResponse: '<xml>mock</xml>',
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FiscalDocumentService,
        FiscalPollingService,
        FiscalRvdService,
        FiscalDocumentRepository,
        FiscalFolioProvider,
        {
          provide: FiscalCustodyService,
          useValue: {},
        },
        {
          provide: FISCAL_FOLIO_PROVIDER,
          useExisting: FiscalFolioProvider,
        },
        FiscalRvdSequenceProvider,
        InMemoryFiscalRvdRepository,
        {
          provide: FISCAL_RVD_TRACKING_REPOSITORY,
          useExisting: InMemoryFiscalRvdRepository,
        },
        FiscalContextResolver,
        {
          provide: FISCAL_ISSUER_STORE,
          useValue: {
            resolveIssuer: jest.fn((lookup) => ({
              ...context,
              ...lookup,
              certificateRef: 'default',
            })),
          },
        },
        {
          provide: FiscalSigningProvider,
          useValue: {
            getSigningMaterial: jest.fn().mockResolvedValue(mockCert),
          },
        },
        {
          provide: FISCAL_SIGNING_PROVIDER,
          useExisting: FiscalSigningProvider,
        },
        {
          provide: FiscalTokenProvider,
          useValue: {
            getToken: jest.fn().mockResolvedValue(mockToken),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'SII_RUT_EMISOR') return '11111111-1';
              if (key === 'SII_FECHA_RESOLUCION') return '2020-01-01';
              if (key === 'SII_NRO_RESOLUCION') return 80;
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    docService = module.get(FiscalDocumentService);
    pollingService = module.get(FiscalPollingService);
    rvdService = module.get(FiscalRvdService);
    repository = module.get(FiscalDocumentRepository);
    folioProvider = module.get(FiscalFolioProvider);

    repository.clear();
  });

  describe('FiscalDocumentService', () => {
    it('emits boleta, stores in repository and retrieves printed sample', async () => {
      // Add CAF xml so folio resolution works
      const caf = cafXml('11111111-1', 10, 20);
      await folioProvider.addCafXml(context, caf);

      const dto = {
        context: {
          fechaResolucion: '2020-01-01',
          nroResolucion: 80,
        },
        document: {
          idDoc: {
            tipoDTE: TipoDTE.BoletaElectronica,
            fechaEmision: '2026-05-25',
          },
          emisor: { rutEmisor: '11111111-1' },
          detalles: [{ nroLinDet: 1, nmbItem: 'Test Item', mntItem: 100 }],
          totales: { mntTotal: 100 },
        },
      };

      const result = await docService.emitirBoleta(dto as any);
      expect(result.internalId).toBeDefined();
      expect(result.folio).toBe(10);
      expect(result.trackId).toBe('mock-track-123');
      expect(mockBoletaSend).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ rutEmisor: '11111111-1' }),
        'mocktoken123',
        mockCert.rutFirmante,
      );
      const boletaSendCalls = mockBoletaSend.mock.calls as Array<
        [string, ...unknown[]]
      >;
      const signedEnvelope = String(boletaSendCalls[0]?.[0] ?? '');
      expect(signedEnvelope).toContain('<SetDTE ID="SetDoc">');
      expect(signedEnvelope).toContain('<Caratula version="1.0">');
      expect(signedEnvelope).toContain('<IndServicio>3</IndServicio>');
      expect(signedEnvelope).toContain('<RznSocEmisor');
      expect(signedEnvelope).toContain('<GiroEmisor');
      expect(signedEnvelope).not.toContain('<Acteco>');
      expect(signedEnvelope).toContain('<FRMT algoritmo="SHA1withRSA">');
      expect(signedEnvelope).toContain('<TmstFirma>');
      const tstedMatch = signedEnvelope.match(/<TSTED>([^<]+)<\/TSTED>/);
      const tmstFirmaMatch = signedEnvelope.match(
        /<TmstFirma>([^<]+)<\/TmstFirma>/,
      );
      const ddMatch = signedEnvelope.match(/<DD>[\s\S]*?<\/DD>/);
      const frmtMatch = signedEnvelope.match(/<FRMT\b[^>]*>([\s\S]*?)<\/FRMT>/);
      expect(tstedMatch?.[1]).toBeTruthy();
      expect(tmstFirmaMatch?.[1]).toBeTruthy();
      expect(tstedMatch?.[1]).toBe(tmstFirmaMatch?.[1]);
      expect(ddMatch?.[0]).toBeTruthy();
      expect(frmtMatch?.[1]).toBeTruthy();
      expect(
        verifyTedSignatureForDdForTest(
          ddMatch?.[0] ?? '',
          parseCaf(caf),
          frmtMatch?.[1]?.trim() ?? '',
        ),
      ).toBe(true);

      // Check document was saved in repository
      const record = repository.findById(result.internalId);
      expect(record).toBeDefined();
      expect(record?.folio).toBe(10);
      expect(record?.trackId).toBe('mock-track-123');

      // Retrieve printed sample
      const sample = docService.getPrintedSample(result.internalId);
      expect(sample.rutEmisor).toBe('11111111-1');
      expect(sample.folio).toBe(10);
      expect(sample.pdf417Payload).toContain('<TED');

      // Request printed sample of invalid document throws NotFound
      expect(() => docService.getPrintedSample('invalid-id')).toThrow(
        NotFoundException,
      );
    });

    it('accepts SII RECEPCIONDTE upload response without leaking raw XML', async () => {
      await folioProvider.addCafXml(context, cafXml('11111111-1', 30, 30));
      mockBoletaSend.mockRejectedValueOnce(
        new SiiSendError(
          'SEND_FAILED',
          'Respuesta inesperada del SII al enviar boleta',
          {
            rawResponse: `<?xml version="1.0" encoding="ISO-8859-1"?>
<RECEPCIONDTE>
  <STATUS>0</STATUS>
  <TRACKID>real-track-789</TRACKID>
  <DETAIL>Upload OK</DETAIL>
</RECEPCIONDTE>`,
          },
        ),
      );

      const dto = {
        context: {
          fechaResolucion: '2020-01-01',
          nroResolucion: 80,
        },
        document: {
          idDoc: {
            tipoDTE: TipoDTE.BoletaElectronica,
            fechaEmision: '2026-05-25',
          },
          emisor: { rutEmisor: '11111111-1' },
          detalles: [{ nroLinDet: 1, nmbItem: 'Test Item', mntItem: 100 }],
          totales: { mntTotal: 100 },
        },
      };

      const result = await docService.emitirBoleta(dto as any);
      const publicJson = JSON.stringify(result);

      expect(result.trackId).toBe('real-track-789');
      expect(result.status).toBe('EPR');
      expect(publicJson).not.toContain('RECEPCIONDTE');
      expect(publicJson).not.toContain('rawResponse');
    });

    it('accepts SII HTML upload response without leaking raw HTML', async () => {
      await folioProvider.addCafXml(context, cafXml('11111111-1', 31, 31));
      mockBoletaSend.mockRejectedValueOnce(
        new SiiSendError(
          'SEND_FAILED',
          'Respuesta inesperada del SII al enviar boleta',
          {
            rawResponse: `<html>
<head><title>RESULTADO DEL UPLOAD DE DOCUMENTOS TRIBUTARIOS ELECTRONICOS</title></head>
<body>
  <table>
    <tr><td>STATUS</td><td>0</td></tr>
    <tr><td>TRACKID</td><td>html-track-456</td></tr>
  </table>
</body>
</html>`,
          },
        ),
      );

      const dto = {
        context: {
          fechaResolucion: '2020-01-01',
          nroResolucion: 80,
        },
        document: {
          idDoc: {
            tipoDTE: TipoDTE.BoletaElectronica,
            fechaEmision: '2026-05-25',
          },
          emisor: { rutEmisor: '11111111-1' },
          detalles: [{ nroLinDet: 1, nmbItem: 'Test Item', mntItem: 100 }],
          totales: { mntTotal: 100 },
        },
      };

      const result = await docService.emitirBoleta(dto as any);
      const publicJson = JSON.stringify(result);

      expect(result.trackId).toBe('html-track-456');
      expect(result.status).toBe('EPR');
      expect(publicJson).not.toContain('<html>');
      expect(publicJson).not.toContain('RESULTADO DEL UPLOAD');
      expect(publicJson).not.toContain('rawResponse');
    });

    it('accepts SII upload XML carried in transport error cause', async () => {
      await folioProvider.addCafXml(context, cafXml('11111111-1', 32, 32));
      const cause = new Error('HTTP 500') as Error & {
        response: { data: string };
      };
      cause.response = {
        data: `<?xml version="1.0" encoding="ISO-8859-1"?>
<RECEPCIONDTE>
  <STATUS>7</STATUS>
  <DETAIL><ERROR>Schema invalido</ERROR></DETAIL>
</RECEPCIONDTE>`,
      };
      mockBoletaSend.mockRejectedValueOnce(
        new SiiSendError('SEND_FAILED', 'Error de red al enviar la boleta', {
          cause,
        }),
      );

      const dto = {
        context: {
          fechaResolucion: '2020-01-01',
          nroResolucion: 80,
        },
        document: {
          idDoc: {
            tipoDTE: TipoDTE.BoletaElectronica,
            fechaEmision: '2026-05-25',
          },
          emisor: { rutEmisor: '11111111-1' },
          detalles: [{ nroLinDet: 1, nmbItem: 'Test Item', mntItem: 100 }],
          totales: { mntTotal: 100 },
        },
      };

      const result = await docService.emitirBoleta(dto as any);
      const publicJson = JSON.stringify(result);

      expect(result.status).toBe('RSC');
      expect(result.detail).toBe('Schema invalido');
      expect(publicJson).not.toContain('RECEPCIONDTE');
      expect(publicJson).not.toContain('rawResponse');
    });

    it('queries boleta status, updates attempts and status in repository', async () => {
      // Manually seed document in repository
      const internalId = 'internal-test-uuid';
      repository.create({
        internalId,
        rutEmisor: '11111111-1',
        tipoDTE: TipoDTE.BoletaElectronica,
        folio: 5,
        trackId: 'mock-track-123',
        status: 'EPR',
        attempts: 0,
        document: {} as any,
        tedXml: '',
      });

      const queryDto = {
        fechaResolucion: '2020-01-01',
        nroResolucion: 80,
      };

      const statusRes = await docService.getBoletaStatus(internalId, queryDto);
      expect(statusRes.trackId).toBe('mock-track-123');
      expect(statusRes.normalizedStatus).toBe('SOK');

      // Verify record attempts incremented and status updated
      const updated = repository.findById(internalId);
      expect(updated?.attempts).toBe(1);
      expect(updated?.status).toBe('SOK');
    });

    it('emits factura 33 through legacy EnvioDTE and stores public result', async () => {
      await folioProvider.addCafXml(
        context,
        cafXml('11111111-1', 100, 110, TipoDTE.FacturaElectronica),
      );

      const result = await docService.emitirLegacyDte(
        {
          context: {
            fechaResolucion: '2020-01-01',
            nroResolucion: 80,
          },
          document: {
            idDoc: {
              tipoDTE: TipoDTE.FacturaElectronica,
              fechaEmision: '2026-05-25',
              formaPago: 1,
            },
            emisor: {
              rutEmisor: '11111111-1',
              rznSoc: 'EMISOR TEST',
              giroEmis: 'SERVICIOS',
              acteco: 620200,
              dirOrigen: 'DIR TEST',
              cmnaOrigen: 'SANTIAGO',
            },
            receptor: {
              rutRecep: '22222222-2',
              rznSocRecep: 'RECEPTOR TEST',
              giroRecep: 'COMERCIO',
              dirRecep: 'DIR RECEP',
              cmnaRecep: 'SANTIAGO',
            },
            detalles: [
              {
                nroLinDet: 1,
                nmbItem: 'Servicio test',
                qtyItem: 1,
                prcItem: 1000,
                montoItem: 1000,
              },
            ],
            totales: {
              mntNeto: 840,
              tasaIVA: 19,
              iva: 160,
              mntTotal: 1000,
            },
          },
        },
        TipoDTE.FacturaElectronica,
      );

      expect(result.internalId).toBeDefined();
      expect(result.folio).toBe(100);
      expect(result.trackId).toBe('mock-legacy-track-333');
      expect(mockLegacySend).toHaveBeenCalledWith(
        expect.stringContaining('<EnvioDTE'),
        expect.objectContaining({ rutEmisor: '11111111-1' }),
        'mocktoken123',
        mockCert.rutFirmante,
      );
      const legacySendCalls = mockLegacySend.mock.calls as Array<
        [string, ...unknown[]]
      >;
      const signedEnvelope = String(legacySendCalls[0]?.[0] ?? '');
      expect(signedEnvelope).toContain('<SetDTE ID="SetDoc">');
      expect(signedEnvelope).toContain('<DTE version="1.0">');
      expect(signedEnvelope).not.toContain('<DTE xmlns=');
      expect(signedEnvelope).toContain('<TipoDTE>33</TipoDTE>');
      expect(signedEnvelope).toContain('<FRMT algoritmo="SHA1withRSA">');
      expect(signedEnvelope).toContain('<FRMA algoritmo="SHA1withRSA">');
      expect(JSON.stringify(result)).not.toContain('rawResponse');
    });

    it('reports factura 33 readiness without leaking fiscal secrets', async () => {
      const missing = await docService.getFactura33Readiness({
        fechaResolucion: '2020-01-01',
        nroResolucion: 80,
      });

      expect(missing.ready).toBe(false);
      expect(missing.tipoDTE).toBe(TipoDTE.FacturaElectronica);
      expect(missing.checks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'certificate', ok: true }),
          expect.objectContaining({ name: 'siiAuth', ok: true }),
          expect.objectContaining({ name: 'caf33', ok: false }),
        ]),
      );
      expect(JSON.stringify(missing)).not.toMatch(
        /rawResponse|rawXml|RSASK|PRIVATE KEY|token|password|pfx/i,
      );

      await folioProvider.addCafXml(
        context,
        cafXml('11111111-1', 300, 301, TipoDTE.FacturaElectronica),
      );

      const ready = await docService.getFactura33Readiness({
        fechaResolucion: '2020-01-01',
        nroResolucion: 80,
      });

      expect(ready.ready).toBe(true);
      expect(ready.checks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'caf33', ok: true }),
        ]),
      );
      expect(JSON.stringify(ready)).not.toMatch(
        /rawResponse|rawXml|RSASK|PRIVATE KEY|token|password|pfx/i,
      );
    });

    it('emits factura de compra 46 through legacy EnvioDTE', async () => {
      await folioProvider.addCafXml(
        context,
        cafXml('11111111-1', 200, 210, TipoDTE.FacturaCompraElectronica),
      );

      const result = await docService.emitirLegacyDte(
        {
          context: {
            fechaResolucion: '2020-01-01',
            nroResolucion: 80,
          },
          document: {
            idDoc: {
              tipoDTE: TipoDTE.FacturaCompraElectronica,
              fechaEmision: '2026-05-25',
              formaPago: 1,
            },
            emisor: {
              rutEmisor: '11111111-1',
              rznSoc: 'EMISOR TEST',
              giroEmis: 'SERVICIOS',
              acteco: 620200,
              dirOrigen: 'DIR TEST',
              cmnaOrigen: 'SANTIAGO',
            },
            receptor: {
              rutRecep: '22222222-2',
              rznSocRecep: 'PROVEEDOR TEST',
              giroRecep: 'COMERCIO',
              dirRecep: 'DIR PROVEEDOR',
              cmnaRecep: 'SANTIAGO',
            },
            detalles: [
              {
                nroLinDet: 1,
                nmbItem: 'Compra test',
                qtyItem: 1,
                prcItem: 1000,
                montoItem: 1000,
              },
            ],
            totales: {
              mntNeto: 840,
              tasaIVA: 19,
              iva: 160,
              mntTotal: 1000,
            },
          },
        },
        TipoDTE.FacturaCompraElectronica,
      );

      expect(result.folio).toBe(200);
      const legacySendCalls = mockLegacySend.mock.calls as Array<
        [string, ...unknown[]]
      >;
      const signedEnvelope = String(legacySendCalls.at(-1)?.[0] ?? '');
      expect(signedEnvelope).toContain('<TipoDTE>46</TipoDTE>');
      expect(JSON.stringify(result)).not.toContain('rawResponse');
    });

    it('emits guia de despacho 52 when traslado fields are present', async () => {
      await folioProvider.addCafXml(
        context,
        cafXml('11111111-1', 300, 310, TipoDTE.GuiaDespachoElectronica),
      );

      const result = await docService.emitirLegacyDte(
        {
          context: {
            fechaResolucion: '2020-01-01',
            nroResolucion: 80,
          },
          document: {
            idDoc: {
              tipoDTE: TipoDTE.GuiaDespachoElectronica,
              fechaEmision: '2026-05-25',
              tipoDespacho: 1,
              indTraslado: 5,
            },
            emisor: {
              rutEmisor: '11111111-1',
              rznSoc: 'EMISOR TEST',
              giroEmis: 'SERVICIOS',
              acteco: 620200,
              dirOrigen: 'DIR TEST',
              cmnaOrigen: 'SANTIAGO',
            },
            receptor: {
              rutRecep: '22222222-2',
              rznSocRecep: 'RECEPTOR TEST',
              giroRecep: 'COMERCIO',
              dirRecep: 'DIR RECEP',
              cmnaRecep: 'SANTIAGO',
            },
            detalles: [
              {
                nroLinDet: 1,
                nmbItem: 'Traslado test',
                qtyItem: 1,
                prcItem: 0,
                montoItem: 0,
              },
            ],
            totales: {
              mntTotal: 0,
            },
          },
        },
        TipoDTE.GuiaDespachoElectronica,
      );

      expect(result.folio).toBe(300);
      const legacySendCalls = mockLegacySend.mock.calls as Array<
        [string, ...unknown[]]
      >;
      const signedEnvelope = String(legacySendCalls.at(-1)?.[0] ?? '');
      expect(signedEnvelope).toContain('<TipoDTE>52</TipoDTE>');
      expect(signedEnvelope).toContain('<IndTraslado>5</IndTraslado>');
      expect(JSON.stringify(result)).not.toContain('rawResponse');
    });

    it('rejects guia de despacho 52 without indTraslado', async () => {
      await expect(
        docService.emitirLegacyDte(
          {
            document: {
              idDoc: {
                tipoDTE: TipoDTE.GuiaDespachoElectronica,
                fechaEmision: '2026-05-25',
              },
              emisor: { rutEmisor: '11111111-1' },
              receptor: {
                rutRecep: '22222222-2',
                rznSocRecep: 'RECEPTOR TEST',
              },
              detalles: [
                {
                  nroLinDet: 1,
                  nmbItem: 'Traslado',
                  prcItem: 0,
                  montoItem: 0,
                },
              ],
              totales: { mntTotal: 0 },
            },
          } as any,
          TipoDTE.GuiaDespachoElectronica,
        ),
      ).rejects.toThrow('requiere indTraslado');
    });

    it('rejects nota de credito 61 without mandatory reference', async () => {
      await expect(
        docService.emitirLegacyDte(
          {
            document: {
              idDoc: {
                tipoDTE: TipoDTE.NotaCredito,
                fechaEmision: '2026-05-25',
              },
              emisor: { rutEmisor: '11111111-1' },
              receptor: {
                rutRecep: '22222222-2',
                rznSocRecep: 'RECEPTOR TEST',
              },
              detalles: [
                {
                  nroLinDet: 1,
                  nmbItem: 'Correccion',
                  prcItem: 1000,
                  montoItem: 1000,
                },
              ],
              totales: { mntTotal: 1000 },
            },
          } as any,
          TipoDTE.NotaCredito,
        ),
      ).rejects.toThrow('requieren al menos una referencia');
      expect(mockLegacySend).not.toHaveBeenCalled();
    });

    it('can create edge provision from valid parameters', async () => {
      const edgeDto = {
        context: {
          fechaResolucion: '2020-01-01',
          nroResolucion: 80,
        },
        tipoDTE: TipoDTE.BoletaElectronica,
        folioStart: 50,
        folioEnd: 60,
        expiresAt: new Date(Date.now() + 1000000).toISOString(),
        maxDocuments: 10,
      };

      const provision = await docService.generateEdgeProvision(edgeDto);
      expect(provision.rutEmisor).toBe('11111111-1');
      expect(provision.folioStart).toBe(50);
      expect(provision.maxDocuments).toBe(10);
      expect(provision.revoked).toBe(false);
    });
  });

  describe('FiscalPollingService', () => {
    it('performs polling and syncs status to repository', async () => {
      const internalId = 'polled-doc-id';
      repository.create({
        internalId,
        rutEmisor: '11111111-1',
        tipoDTE: TipoDTE.BoletaElectronica,
        folio: 5,
        trackId: 'track-to-poll',
        status: 'EPR',
        attempts: 2,
        document: {} as any,
        tedXml: '',
      });

      const pollDto = {
        context: {
          fechaResolucion: '2020-01-01',
          nroResolucion: 80,
        },
        trackId: 'track-to-poll',
        attempt: 2,
      };

      const res = await pollingService.pollSendStatus(pollDto);
      expect(res.trackId).toBe('track-to-poll');

      // Verify repository updated
      const updated = repository.findById(internalId);
      expect(updated?.attempts).toBe(3);
      expect(updated?.status).toBe('SOK');
    });
  });

  describe('FiscalRvdService', () => {
    it('sends RVD and resolves secEnvio sequence number if omitted', async () => {
      const rvdDto = {
        context: {
          fechaResolucion: '2020-01-01',
          nroResolucion: 80,
        },
        fecha: '2026-05-25',
        totales: [
          {
            tipoDTE: TipoDTE.BoletaElectronica,
            cantidad: 5,
            montoTotal: 500,
          },
        ],
      };

      const res = await rvdService.send(rvdDto);
      expect(res.trackId).toBe('mock-rvd-track-456');
    });
  });
});

function cafXml(
  rutEmisor: string,
  start: number,
  end: number,
  tipoDTE: TipoDTE = TipoDTE.BoletaElectronica,
): string {
  const keys = forge.pki.rsa.generateKeyPair(512);
  const privateKeyAsn1 = forge.pki.privateKeyToAsn1(keys.privateKey);
  const privateKeyDer = forge.asn1.toDer(privateKeyAsn1).getBytes();
  const rsask = forge.util.encode64(privateKeyDer);

  const publicKeyAsn1 = forge.pki.publicKeyToAsn1(keys.publicKey);
  const publicKeyDer = forge.asn1.toDer(publicKeyAsn1).getBytes();
  const modulusHex = toEvenLengthHex(keys.publicKey.n.toString(16));
  const exponentHex = toEvenLengthHex(keys.publicKey.e.toString(16));
  const rsapkModulus = forge.util.encode64(forge.util.hexToBytes(modulusHex));
  const rsapkExponent = forge.util.encode64(forge.util.hexToBytes(exponentHex));
  const rsapubk = forge.util.encode64(publicKeyDer);

  return `<?xml version="1.0" encoding="ISO-8859-1"?>
<AUTORIZACION>
  <CAF version="1.0">
    <DA>
      <RE>${rutEmisor}</RE>
      <RS>EMISOR TEST</RS>
      <TD>${tipoDTE}</TD>
      <RNG><D>${start}</D><H>${end}</H></RNG>
      <FA>2026-01-01</FA>
      <RSAPK>
        <M>${rsapkModulus}</M>
        <E>${rsapkExponent}</E>
      </RSAPK>
      <IDK>1</IDK>
    </DA>
    <FRMA algoritmo="SHA1withRSA">firma</FRMA>
  </CAF>
  <RSASK>${rsask}</RSASK>
  <RSAPUBK>${rsapubk}</RSAPUBK>
</AUTORIZACION>`;
}

function toEvenLengthHex(value: string): string {
  return value.length % 2 === 0 ? value : `0${value}`;
}

function verifyTedSignatureForDdForTest(
  ddXml: string,
  caf: ReturnType<typeof parseCaf>,
  signatureBase64: string,
): boolean {
  const publicKey = forge.pki.setRsaPublicKey(
    new forge.jsbn.BigInteger(
      forge.util.bytesToHex(forge.util.decode64(caf.da.rsaPk.modulus)),
      16,
    ),
    new forge.jsbn.BigInteger(
      forge.util.bytesToHex(forge.util.decode64(caf.da.rsaPk.exponent)),
      16,
    ),
  );
  const md = forge.md.sha1.create();
  md.update(ddXml, 'utf8');
  return publicKey.verify(
    md.digest().bytes(),
    forge.util.decode64(signatureBase64),
  );
}
