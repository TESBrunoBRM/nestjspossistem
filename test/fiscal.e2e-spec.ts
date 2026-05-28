/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import forge from 'node-forge';

process.env.API_KEY = 'test-api-key';
process.env.API_KEY_FRONTEND = 'test-api-key';
process.env.SII_RUT_EMISOR = '76123456-0';
process.env.SII_FECHA_RESOLUCION = '2020-01-01';
process.env.SII_NRO_RESOLUCION = '80';
import { ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
process.env.SII_AMBIENTE = '0';
process.env.NODE_ENV = 'test';
process.env.SII_PFX_PATH = '';
process.env.SII_PFX_PASSWORD = '';
process.env.SII_CAF_PATH = '';
process.env.SII_CAF_PATHS = '';

// Mock the Sii Clients from sii-engine
jest.mock('sii-engine', () => {
  const original = jest.requireActual('sii-engine');
  return {
    ...original,
    BoletaSiiClient: jest.fn().mockImplementation(() => ({
      send: jest.fn().mockResolvedValue({
        trackId: 'e2e-track-123',
        status: 'EPR',
        rawResponse: '<xml>mock</xml>',
      }),
      queryStatus: jest.fn().mockResolvedValue({
        trackId: 'e2e-track-123',
        status: 'SOK',
        rawResponse: '<xml>mock</xml>',
      }),
      sendRvd: jest.fn().mockResolvedValue({
        trackId: 'e2e-rvd-track-456',
        status: 'EPR',
        rawResponse: '<xml>mock</xml>',
      }),
    })),
    LegacySiiClient: jest.fn().mockImplementation(() => ({
      queryStatus: jest.fn().mockResolvedValue({
        trackId: 'e2e-track-123',
        status: 'SOK',
        rawResponse: '<xml>mock</xml>',
      }),
    })),
  };
});

import { AppModule } from '../src/app.module';
import { FiscalSigningProvider } from '../src/fiscal/fiscal-signing.provider';
import { FiscalFolioProvider } from '../src/fiscal-documents/fiscal-folio.provider';
import { FiscalTokenProvider } from '../src/fiscal/fiscal-token.provider';
import { ConfigService } from '@nestjs/config';
import { SiiEnvironment, TipoDTE } from 'sii-engine';

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

describe('FiscalController (e2e)', () => {
  let app: INestApplication;
  let internalId: string;

  beforeAll(async () => {
    jest.spyOn(ThrottlerGuard.prototype, 'canActivate').mockResolvedValue(true);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(APP_GUARD)
      .useValue({ canActivate: () => true })
      .overrideProvider(ConfigService)
      .useValue({
        get: jest.fn((key: string) => {
          if (key === 'SII_RUT_EMISOR') return '76123456-0';
          if (key === 'SII_FECHA_RESOLUCION') return '2020-01-01';
          if (key === 'SII_NRO_RESOLUCION') return 80;
          if (key === 'SII_AMBIENTE') return 0;
          if (key === 'API_KEY_FRONTEND') return 'test-api-key';
          return undefined;
        }),
      })
      .overrideProvider(FiscalTokenProvider)
      .useValue({
        getToken: jest.fn().mockResolvedValue({
          token: 'mock-e2e-token-abc',
          obtainedAt: new Date(),
          environment: SiiEnvironment.Certificacion,
        }),
        invalidate: jest.fn(),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.useGlobalInterceptors(new TransformInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    // Register mock certificates and CAF in providers
    const signing = app.get(FiscalSigningProvider);
    signing.registerPem(
      'default',
      generatedCert.certificatePem,
      generatedCert.privateKeyPem,
    );

    const folios = app.get(FiscalFolioProvider);
    const context = {
      environment: SiiEnvironment.Certificacion,
      rutEmisor: '76123456-0',
      fechaResolucion: '2020-01-01',
      nroResolucion: 80,
    };
    await folios.addCafXml(context, cafXml('76123456-0', 1, 100));
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/fiscal/health reports the native engine', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/fiscal/health')
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data).toEqual({
      engine: 'sii-engine',
      simpleApiEnabled: false,
      status: 'ok',
    });
    expectPublicPayloadSafe(response.body);
  });

  it('protects fiscal document and polling endpoints with api key', async () => {
    await request(app.getHttpServer())
      .post('/api/fiscal/documents/boletas')
      .expect(401);

    await request(app.getHttpServer())
      .get('/api/fiscal/documents/123/status')
      .expect(401);

    await request(app.getHttpServer()).post('/api/fiscal/rvd').expect(401);

    await request(app.getHttpServer())
      .post('/api/fiscal/polling/123/poll-once')
      .expect(401);

    await request(app.getHttpServer())
      .post('/api/fiscal/folios/cafs')
      .expect(401);

    await request(app.getHttpServer())
      .get('/api/fiscal/folios/status')
      .expect(401);

    await request(app.getHttpServer())
      .post('/api/fiscal/folios/reserve')
      .expect(401);

    await request(app.getHttpServer())
      .post('/api/fiscal/folios/requests')
      .expect(401);
  });

  it('POST /api/fiscal/folios/cafs imports CAF and returns public metadata', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/fiscal/folios/cafs')
      .set('x-api-key', 'test-api-key')
      .send({
        context: folioContext(),
        cafXml: cafXml('76123456-0', 200, 205),
      })
      .expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.data).toMatchObject({
      rutEmisor: '76123456-0',
      tipoDTE: TipoDTE.BoletaElectronica,
      rangeStart: 200,
      rangeEnd: 205,
      fechaAutorizacion: '2026-01-01',
    });
    expectPublicPayloadSafe(response.body);
  });

  it('GET /api/fiscal/folios/status returns public CAF status', async () => {
    await request(app.getHttpServer())
      .post('/api/fiscal/folios/cafs')
      .set('x-api-key', 'test-api-key')
      .send({
        context: folioContext(),
        cafXml: cafXml('76123456-0', 300, 305),
      })
      .expect(201);

    const response = await request(app.getHttpServer())
      .get('/api/fiscal/folios/status')
      .set('x-api-key', 'test-api-key')
      .query({
        ...folioContext(),
        tipoDTE: TipoDTE.BoletaElectronica,
      })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: 'active',
          remaining: 6,
          caf: expect.objectContaining({
            rutEmisor: '76123456-0',
            rangeStart: 300,
            rangeEnd: 305,
          }),
        }),
      ]),
    );
    expectPublicPayloadSafe(response.body);
  });

  it('POST /api/fiscal/folios/reserve reserves a specific folio', async () => {
    await request(app.getHttpServer())
      .post('/api/fiscal/folios/cafs')
      .set('x-api-key', 'test-api-key')
      .send({
        context: folioContext(),
        cafXml: cafXml('76123456-0', 400, 405),
      })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post('/api/fiscal/folios/reserve')
      .set('x-api-key', 'test-api-key')
      .send({
        context: folioContext(),
        tipoDTE: TipoDTE.BoletaElectronica,
        folio: 400,
      })
      .expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.data).toMatchObject({
      folio: 400,
      caf: {
        rutEmisor: '76123456-0',
        rangeStart: 400,
        rangeEnd: 405,
      },
    });
    expectPublicPayloadSafe(response.body);
  });

  it('POST /api/fiscal/folios/requests creates a safe SII portal CAF acquisition request', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/fiscal/folios/requests')
      .set('x-api-key', 'test-api-key')
      .send({
        context: folioContext(),
        tipoDTE: TipoDTE.BoletaElectronica,
        quantity: 25,
        idempotencyKey: 'e2e-caf-request-1',
      })
      .expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.data).toMatchObject({
      status: 'manual_action_required',
      method: 'sii_portal_automation',
      rutEmisor: '76123456-0',
      tipoDTE: TipoDTE.BoletaElectronica,
      quantityRequested: 25,
      retryable: false,
    });
    expect(response.body.data.requestId).toBeDefined();
    expectPublicPayloadSafe(response.body);
  });

  it('POST /api/fiscal/documents/boletas emits a boleta successfully', async () => {
    const payload = {
      context: {
        fechaResolucion: '2020-01-01',
        nroResolucion: 80,
      },
      document: {
        idDoc: {
          tipoDTE: TipoDTE.BoletaElectronica,
          fechaEmision: '2026-05-25',
        },
        emisor: {
          rutEmisor: '76123456-0',
          rznSoc: 'EMPRESA DE PRUEBA',
          giroEmis: 'VENTA AL POR MENOR',
          acteco: 521100,
          dirOrigen: 'AV. PROVIDENCIA 123',
          cmnaOrigen: 'PROVIDENCIA',
        },
        detalles: [
          { nroLinDet: 1, nmbItem: 'Chocolate', prcItem: 500, montoItem: 500 },
        ],
        totales: { mntTotal: 500 },
      },
    };

    const response = await request(app.getHttpServer())
      .post('/api/fiscal/documents/boletas')
      .set('x-api-key', 'test-api-key')
      .send(payload)
      .expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.data.internalId).toBeDefined();
    expect(response.body.data.folio).toBe(1);
    expect(response.body.data.trackId).toBe('e2e-track-123');
    expectPublicPayloadSafe(response.body);

    internalId = response.body.data.internalId;
  });

  it('GET /api/fiscal/documents/:id/status checks status and increments attempts', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/fiscal/documents/${internalId}/status`)
      .set('x-api-key', 'test-api-key')
      .query({
        fechaResolucion: '2020-01-01',
        nroResolucion: 80,
      })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.trackId).toBe('e2e-track-123');
    expect(response.body.data.normalizedStatus).toBe('SOK');
    expectPublicPayloadSafe(response.body);
  });

  it('GET /api/fiscal/documents/:id/printed-sample retrieves print payload', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/fiscal/documents/${internalId}/printed-sample`)
      .set('x-api-key', 'test-api-key')
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.rutEmisor).toBe('76123456-0');
    expect(response.body.data.pdf417Payload).toContain('<TED');
    expectPublicPayloadSafe(response.body);
  });

  it('POST /api/fiscal/polling/:trackId/poll-once checks polling status using url parameter', async () => {
    const payload = {
      context: {
        fechaResolucion: '2020-01-01',
        nroResolucion: 80,
      },
      attempt: 1,
    };

    const response = await request(app.getHttpServer())
      .post(`/api/fiscal/polling/e2e-track-123/poll-once`)
      .set('x-api-key', 'test-api-key')
      .send(payload)
      .expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.data.trackId).toBe('e2e-track-123');
    expect(response.body.data.normalizedStatus).toBe('SOK');
    expectPublicPayloadSafe(response.body);
  });

  it('POST /api/fiscal/rvd sends Resumen Ventas Diarias successfully with resolved secEnvio', async () => {
    const payload = {
      context: {
        fechaResolucion: '2020-01-01',
        nroResolucion: 80,
      },
      fecha: '2026-05-25',
      totales: [
        {
          tipoDTE: TipoDTE.BoletaElectronica,
          cantidad: 10,
          montoTotal: 5000,
        },
      ],
    };

    const response = await request(app.getHttpServer())
      .post('/api/fiscal/rvd')
      .set('x-api-key', 'test-api-key')
      .send(payload)
      .expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.data.trackId).toBe('e2e-rvd-track-456');
    expectPublicPayloadSafe(response.body);
  });

  it('POST /api/fiscal/edge/provisions generates provision safely', async () => {
    const payload = {
      context: {
        fechaResolucion: '2020-01-01',
        nroResolucion: 80,
      },
      tipoDTE: TipoDTE.BoletaElectronica,
      folioStart: 10,
      folioEnd: 20,
      expiresAt: new Date(Date.now() + 1000000).toISOString(),
    };

    const response = await request(app.getHttpServer())
      .post('/api/fiscal/edge/provisions')
      .set('x-api-key', 'test-api-key')
      .send(payload)
      .expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.data.rutEmisor).toBe('76123456-0');
    expect(response.body.data.folioStart).toBe(10);
    expect(response.body.data.revoked).toBe(false);
    expectPublicPayloadSafe(response.body);
  });

  it('rejects the request if request body contains forbidden keys (e.g. password)', async () => {
    const payload = {
      context: {
        fechaResolucion: '2020-01-01',
        nroResolucion: 80,
      },
      document: {
        idDoc: {
          tipoDTE: TipoDTE.BoletaElectronica,
          fechaEmision: '2026-05-25',
        },
        emisor: {
          rutEmisor: '76123456-0',
          rznSoc: 'EMPRESA DE PRUEBA',
          giroEmis: 'VENTA AL POR MENOR',
          acteco: 521100,
          dirOrigen: 'AV. PROVIDENCIA 123',
          cmnaOrigen: 'PROVIDENCIA',
        },
        detalles: [
          { nroLinDet: 1, nmbItem: 'Chocolate', prcItem: 500, montoItem: 500 },
        ],
        totales: { mntTotal: 500 },
      },
      password: 'forbidden-password-attempt',
    };

    const response = await request(app.getHttpServer())
      .post('/api/fiscal/documents/boletas')
      .set('x-api-key', 'test-api-key')
      .send(payload)
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.error.message).toContain(
      'campos de seguridad prohibidos',
    );
    expectPublicPayloadSafe(response.body);
  });
});

function expectPublicPayloadSafe(body: unknown): void {
  const serialized = JSON.stringify(body);

  expect(serialized).not.toMatch(
    /rawResponse|rawXml|signedXml|signedEnvelope|privateKey|privateKeyPem|RSASK|PFX|SII_PFX|<CAF|BEGIN [^-]*PRIVATE KEY|mock-e2e-token-abc|token|cookie/i,
  );
}

function folioContext() {
  return {
    fechaResolucion: '2020-01-01',
    nroResolucion: 80,
  };
}

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
