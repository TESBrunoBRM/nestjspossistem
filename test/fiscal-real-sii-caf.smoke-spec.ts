import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { Response } from 'supertest';
import { resolveProjectPath } from '../src/common/utils/project-path.util';
import { loadCertificateMaterialFromP12 } from '../src/fiscal/fiscal-certificate.util';
import { createFiscalTestApp } from './support/nest-test-app';
import { optionalEnv, prepareRealSiiTestEnv } from './support/env-loader';
import {
  certificationDteName,
  parseCafAcquisitionQuantity,
  parseCertificationDteType,
  parseCertificationEnvironment,
  resolveCertificationTenantId,
} from './support/sii-certification-options';

prepareRealSiiTestEnv();

jest.setTimeout(300000);

const tipoDTE = parseCertificationDteType();
const dteName = certificationDteName(tipoDTE);

describe(`Real SII CAF ${tipoDTE} acquisition (smoke)`, () => {
  let app: INestApplication;
  let apiKey: string;

  const tenantId = resolveCertificationTenantId(tipoDTE);
  const merchantId =
    optionalEnv('REAL_SII_TEST_MERCHANT_ID') || 'merchant-main';
  const branchId = optionalEnv('REAL_SII_TEST_BRANCH_ID') || 'branch-001';
  const rutEmisor = optionalEnv('REAL_SII_TEST_RUT_EMISOR') || '';
  const rutFirmante = optionalEnv('REAL_SII_TEST_RUT_FIRMANTE') || '';
  const fechaResolucion = optionalEnv('REAL_SII_TEST_FECHA_RESOLUCION') || '';
  const nroResolucionRaw = optionalEnv('REAL_SII_TEST_NRO_RESOLUCION') || '';
  const nroResolucion = Number(nroResolucionRaw);
  const pfxPath = resolveProjectPath(
    optionalEnv('REAL_SII_TEST_PFX_PATH') ||
      'secure/real-sii-tests/certificado.pfx',
  );
  const pfxPassword = optionalEnv('REAL_SII_TEST_PFX_PASSWORD') || '';
  const cafQuantity = parseCafAcquisitionQuantity(tipoDTE);
  const environment = parseCertificationEnvironment();

  beforeAll(async () => {
    if (!rutEmisor) {
      throw new Error('Falta REAL_SII_TEST_RUT_EMISOR para adquirir CAF.');
    }
    if (!existsSync(pfxPath)) {
      throw new Error(
        `Falta el archivo PFX para adquirir CAF ${tipoDTE} en ${pfxPath}.`,
      );
    }
    if (!pfxPassword) {
      throw new Error(
        `Falta la password del PFX para adquirir CAF ${tipoDTE}.`,
      );
    }
    if (!rutFirmante) {
      throw new Error('Falta REAL_SII_TEST_RUT_FIRMANTE para adquirir CAF.');
    }
    if (!fechaResolucion) {
      throw new Error(
        'Falta REAL_SII_TEST_FECHA_RESOLUCION para adquirir CAF.',
      );
    }
    if (!Number.isInteger(nroResolucion) || nroResolucion < 0) {
      throw new Error(
        `REAL_SII_TEST_NRO_RESOLUCION es invalido (${nroResolucionRaw || 'vacio'}).`,
      );
    }

    try {
      loadCertificateMaterialFromP12(
        readFileSync(pfxPath),
        pfxPassword,
        rutFirmante,
      );
    } catch (error) {
      throw new Error(
        `No se pudo abrir el PFX en ${pfxPath}. Causa: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    apiKey = process.env.API_KEY_FRONTEND || 'dev-ministack-key';
    app = await createFiscalTestApp();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it(`acquires CAF ${tipoDTE} from SII certification and persists it`, async () => {
    await request(testServer(app))
      .post('/api/fiscal/issuers')
      .set('x-api-key', apiKey)
      .send({
        tenantId,
        merchantId,
        branchId,
        rutEmisor,
        environment,
        fechaResolucion,
        nroResolucion,
        pfxBase64: readFileSync(pfxPath).toString('base64'),
        pfxPassword,
        rutFirmante,
      })
      .expect(201);

    const context = {
      tenantId,
      merchantId,
      branchId,
      rutEmisor,
      environment,
    };
    const availabilityResponse = await request(testServer(app))
      .post('/api/fiscal/folios/availability')
      .set('x-api-key', apiKey)
      .send({ context, tipoDTE })
      .expect(201);

    assertPublicPayloadSafe(availabilityResponse.body);
    const availabilityData =
      responseData<FolioAvailabilityApiData>(availabilityResponse);
    if (availabilityData.status !== 'available') {
      writeFailureArtifact('availability', availabilityResponse.body);
      throw new Error(
        `SII no habilito folios CAF ${tipoDTE}. Status: ${availabilityData.status}. Disponible: ${availabilityData.availableFolios ?? 'n/a'}. Maximo: ${availabilityData.maxAuthorizedFolios ?? 'n/a'}. Detail: ${availabilityData.detail || 'n/a'}.`,
      );
    }

    const cafResponse = await request(testServer(app))
      .post('/api/fiscal/folios/requests')
      .set('x-api-key', apiKey)
      .send({
        context,
        tipoDTE,
        quantity: cafQuantity,
        idempotencyKey: `cert-${dteName}-${Date.now()}`,
      })
      .expect(201);

    assertPublicPayloadSafe(cafResponse.body);
    const cafData = responseData<CafRequestApiData>(cafResponse);
    if (cafData.status !== 'imported') {
      writeFailureArtifact('acquisition', cafResponse.body);
      throw new Error(
        `La adquisicion CAF ${tipoDTE} no termino importada. Status: ${cafData.status}. Retryable: ${cafData.retryable ?? 'n/a'}. Detail: ${cafData.detail || 'n/a'}.`,
      );
    }
    expect(cafData).toMatchObject({
      status: 'imported',
      tipoDTE,
      caf: expect.objectContaining({ rutEmisor, tipoDTE }),
    });

    const statusResponse = await request(testServer(app))
      .get('/api/fiscal/folios/status')
      .set('x-api-key', apiKey)
      .query({ tenantId, rutEmisor, environment, tipoDTE })
      .expect(200);

    assertPublicPayloadSafe(statusResponse.body);
    expect(hasActiveCaf(responseData<unknown>(statusResponse))).toBe(true);
  });
});

type SuperTestTarget = Parameters<typeof request>[0];

interface CafRequestApiData {
  status: string;
  detail?: string;
  retryable?: boolean;
  tipoDTE?: number;
  caf?: { rutEmisor?: string; tipoDTE?: number };
}

interface FolioAvailabilityApiData {
  status: string;
  detail?: string;
  availableFolios?: number;
  maxAuthorizedFolios?: number;
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

function hasActiveCaf(statuses: unknown): boolean {
  return (
    Array.isArray(statuses) &&
    statuses.some((entry) => {
      const item = entry as { status?: unknown; remaining?: unknown };
      return (
        (item.status === 'active' || item.status === 'expiring_soon') &&
        Number(item.remaining) > 0
      );
    })
  );
}

function writeFailureArtifact(kind: string, body: unknown): void {
  const artifactDir = resolveProjectPath(
    `secure/real-sii-tests/artifacts/caf${tipoDTE}/last-failed-${kind}`,
  );
  mkdirSync(artifactDir, { recursive: true });
  writeFileSync(
    join(artifactDir, 'response-body.json'),
    JSON.stringify(body, null, 2),
  );
}

function assertPublicPayloadSafe(body: unknown): void {
  expect(JSON.stringify(body)).not.toMatch(
    /RSASK|rawXml|<CAF|PRIVATE KEY|privateKey|token|password|pfx/i,
  );
}
