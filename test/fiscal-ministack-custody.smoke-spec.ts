import request from 'supertest';
import type { Response } from 'supertest';
import { INestApplication } from '@nestjs/common';
import { SiiEnvironment, TipoDTE } from 'sii-engine';
import { FiscalContextResolver } from '../src/fiscal/fiscal-context.resolver';
import { FiscalSigningProvider } from '../src/fiscal/fiscal-signing.provider';
import { FiscalDocumentRepository } from '../src/fiscal-documents/fiscal-document.repository';
import { FiscalFolioProvider } from '../src/fiscal-documents/fiscal-folio.provider';
import { createFiscalTestApp } from './support/nest-test-app';
import { prepareMinistackTestEnv } from './support/env-loader';
import {
  buildCafXml,
  createTestPfxWithoutRut,
} from './support/fiscal-fixtures';

prepareMinistackTestEnv();

jest.setTimeout(120000);

describe('Fiscal custody on Ministack (smoke)', () => {
  let app: INestApplication;
  let apiKey: string;

  const tenantId = `ministack-custody-smoke-${Date.now()}-${process.pid}`;
  const rutEmisor = '76123456-0';
  const rutFirmante = '12345678-5';
  const pfxPassword = 'custody-smoke-password';

  beforeAll(async () => {
    apiKey = process.env.API_KEY_FRONTEND || 'dev-ministack-key';
    app = await createFiscalTestApp();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    jest.restoreAllMocks();
  });

  it('persists issuer certificate and CAF in AWS-mode custody across app restarts even when the certificate requires rutFirmante override', async () => {
    const pfx = createTestPfxWithoutRut(
      pfxPassword,
      'Firmante smoke sin RUT explicito',
    );

    const upsertResponse = await request(testServer(app))
      .post('/api/fiscal/issuers')
      .set('x-api-key', apiKey)
      .send({
        tenantId,
        merchantId: 'merchant-ministack',
        branchId: 'branch-ministack',
        rutEmisor,
        environment: SiiEnvironment.Certificacion,
        fechaResolucion: '2020-01-01',
        nroResolucion: 80,
        pfxBase64: pfx.pfxBuffer.toString('base64'),
        pfxPassword,
        rutFirmante,
      });

    if (upsertResponse.status !== 201) {
      throw new Error(
        `Upsert issuer fallo con HTTP ${upsertResponse.status}: ${JSON.stringify(upsertResponse.body)}`,
      );
    }

    const upsertData = responseData<FiscalIssuerApiData>(upsertResponse);
    expect(upsertData).toMatchObject({
      tenantId,
      rutEmisor,
      environment: SiiEnvironment.Certificacion,
      custodyMode: 'aws',
    });

    await request(testServer(app))
      .post('/api/fiscal/folios/cafs')
      .set('x-api-key', apiKey)
      .send({
        context: {
          tenantId,
          merchantId: 'merchant-ministack',
          branchId: 'branch-ministack',
          rutEmisor,
          environment: SiiEnvironment.Certificacion,
        },
        cafXml: buildCafXml(rutEmisor, 900, 905),
      })
      .expect(201);

    await app.close();
    app = await createFiscalTestApp();

    const issuerResponse = await request(testServer(app))
      .get('/api/fiscal/issuers')
      .set('x-api-key', apiKey)
      .query({
        tenantId,
        rutEmisor,
        environment: SiiEnvironment.Certificacion,
      })
      .expect(200);

    const issuerData = responseData<FiscalIssuerApiData>(issuerResponse);
    expect(issuerData).toMatchObject({
      tenantId,
      rutEmisor,
      environment: SiiEnvironment.Certificacion,
      custodyMode: 'aws',
    });

    const statuses = await request(testServer(app))
      .get('/api/fiscal/folios/status')
      .set('x-api-key', apiKey)
      .query({
        tenantId,
        rutEmisor,
        environment: SiiEnvironment.Certificacion,
        tipoDTE: TipoDTE.BoletaElectronica,
      })
      .expect(200);

    const folioStatuses = responseData<FolioStatusApiData[]>(statuses);
    const activeStatus = folioStatuses.find(
      (status) =>
        status.status === 'active' &&
        status.caf.rutEmisor === rutEmisor &&
        status.caf.rangeStart === 900 &&
        status.caf.rangeEnd === 905,
    );
    expect(activeStatus?.remaining).toBe(6);

    const reserveResponse = await request(testServer(app))
      .post('/api/fiscal/folios/reserve')
      .set('x-api-key', apiKey)
      .send({
        context: {
          tenantId,
          rutEmisor,
          environment: SiiEnvironment.Certificacion,
        },
        tipoDTE: TipoDTE.BoletaElectronica,
        folio: 900,
      })
      .expect(201);

    const reserveData = responseData<FolioAssignmentApiData>(reserveResponse);
    expect(reserveData.folio).toBe(900);
    expect(reserveData.caf.rutEmisor).toBe(rutEmisor);
    expect(reserveData.caf.rangeStart).toBe(900);
    expect(reserveData.caf.rangeEnd).toBe(905);

    const contextResolver = app.get(FiscalContextResolver);
    const signingProvider = app.get(FiscalSigningProvider);
    const folioProvider = app.get(FiscalFolioProvider);
    const context = await contextResolver.resolve({
      tenantId,
      rutEmisor,
      environment: SiiEnvironment.Certificacion,
    });

    await folioProvider.releaseLatestFolio(
      context,
      TipoDTE.BoletaElectronica,
      900,
    );
    await expect(
      folioProvider.getNextFolio(context, TipoDTE.BoletaElectronica),
    ).resolves.toEqual(expect.objectContaining({ folio: 900 }));

    const material = await signingProvider.getSigningMaterial(context);

    expect(material.rutFirmante).toBe(rutFirmante);
    expect(material.certificatePem).toContain('BEGIN CERTIFICATE');
    expect(material.privateKeyPem).toContain('BEGIN RSA PRIVATE KEY');
  });
  it('persists document metadata and signed XML across app restarts', async () => {
    const internalId = `ministack-document-${Date.now()}-${process.pid}`;
    const trackId = `ministack-track-${Date.now()}-${process.pid}`;
    const repository = app.get(FiscalDocumentRepository);
    expect(repository.mode()).toBe('aws');

    await repository.createDurable({
      internalId,
      tenantId,
      environment: SiiEnvironment.Certificacion,
      rutEmisor,
      tipoDTE: TipoDTE.FacturaElectronica,
      folio: 901,
      trackId,
      status: 'EPR',
      dteStatus: 'DOK',
      attempts: 1,
      document: Object.assign(new SyntheticDteDocument(), {
        idDoc: {
          tipoDTE: TipoDTE.FacturaElectronica,
          folio: 901,
          fechaEmision: '2026-07-16',
        },
        emisor: {} as never,
        receptor: {} as never,
        detalles: [],
        totales: { mntTotal: 0 },
      }),
      tedXml: '<TED version="1.0"><DD /></TED>',
      signedDteXml: '<DTE ID="DTE-901" />',
      signedEnvelopeXml: '<EnvioDTE ID="SetDoc" />',
    });

    await app.close();
    app = await createFiscalTestApp();

    const reloadedRepository = app.get(FiscalDocumentRepository);
    const byId = await reloadedRepository.findByIdDurable(internalId);
    const byTrack = await reloadedRepository.findByTrackIdDurable(trackId);

    expect(byId).toMatchObject({
      internalId,
      tenantId,
      rutEmisor,
      folio: 901,
      dteStatus: 'DOK',
    });
    expect(byId?.tedXml).toContain('<TED');
    expect(byId?.signedDteXml).toContain('<DTE');
    expect(byId?.signedEnvelopeXml).toContain('<EnvioDTE');
    expect(byTrack?.internalId).toBe(internalId);
  });
});

class SyntheticDteDocument {}

type SuperTestTarget = Parameters<typeof request>[0];

interface FiscalIssuerApiData {
  tenantId: string;
  rutEmisor: string;
  environment: SiiEnvironment;
  custodyMode: string;
}

interface FolioAssignmentApiData {
  folio: number;
  caf: {
    rutEmisor: string;
    rangeStart: number;
    rangeEnd: number;
  };
}

interface FolioStatusApiData {
  status: string;
  remaining: number;
  caf: {
    rutEmisor: string;
    rangeStart: number;
    rangeEnd: number;
  };
}

function testServer(app: INestApplication): SuperTestTarget {
  return app.getHttpServer() as SuperTestTarget;
}

function responseData<T>(response: Response): T {
  const body: unknown = response.body;
  if (!isRecord(body) || !('data' in body)) {
    throw new Error('Respuesta HTTP sin envelope data.');
  }

  return body.data as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
