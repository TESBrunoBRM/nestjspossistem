/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return */
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import forge from 'node-forge';
import {
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
const mockLegacyQueryStatus = jest.fn();

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
      queryStatus: mockLegacyQueryStatus,
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FiscalDocumentService,
        FiscalPollingService,
        FiscalRvdService,
        FiscalDocumentRepository,
        FiscalFolioProvider,
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
      await folioProvider.addCafXml(context, cafXml('11111111-1', 10, 20));

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
      const signedEnvelope = String(mockBoletaSend.mock.calls[0][0]);
      expect(signedEnvelope).toContain('<SetDTE ID="SetDoc">');
      expect(signedEnvelope).toContain('<Caratula version="1.0">');
      expect(signedEnvelope).toContain('<IndServicio>3</IndServicio>');
      expect(signedEnvelope).toContain('<RznSocEmisor');
      expect(signedEnvelope).toContain('<GiroEmisor');
      expect(signedEnvelope).not.toContain('<Acteco>');
      expect(signedEnvelope).toContain('<FRMT algoritmo="SHA1withRSA">');
      expect(signedEnvelope).toContain('<TmstFirma>');

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

function cafXml(rutEmisor: string, start: number, end: number): string {
  const keys = forge.pki.rsa.generateKeyPair(512);
  const privateKeyAsn1 = forge.pki.privateKeyToAsn1(keys.privateKey);
  const privateKeyDer = forge.asn1.toDer(privateKeyAsn1).getBytes();
  const rsask = forge.util.encode64(privateKeyDer);

  const publicKeyAsn1 = forge.pki.publicKeyToAsn1(keys.publicKey);
  const publicKeyDer = forge.asn1.toDer(publicKeyAsn1).getBytes();
  const rsapubk = forge.util.encode64(publicKeyDer);

  return `<?xml version="1.0" encoding="ISO-8859-1"?>
<AUTORIZACION>
  <CAF version="1.0">
    <DA>
      <RE>${rutEmisor}</RE>
      <RS>EMISOR TEST</RS>
      <TD>39</TD>
      <RNG><D>${start}</D><H>${end}</H></RNG>
      <FA>2026-01-01</FA>
      <RSAPK>
        <M>${rsapubk}</M>
        <E>Aw==</E>
      </RSAPK>
      <IDK>1</IDK>
    </DA>
    <FRMA algoritmo="SHA1withRSA">firma</FRMA>
  </CAF>
  <RSASK>${rsask}</RSASK>
  <RSAPUBK>${rsapubk}</RSAPUBK>
</AUTORIZACION>`;
}
