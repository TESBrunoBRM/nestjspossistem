import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import request from 'supertest';
import type { Response } from 'supertest';
import { INestApplication } from '@nestjs/common';
import { FiscalContextResolver } from '../../src/fiscal/fiscal-context.resolver';
import { FiscalTokenProvider } from '../../src/fiscal/fiscal-token.provider';
import { FISCAL_SIGNING_PROVIDER } from '../../src/fiscal/fiscal-provider.tokens';
import { loadCertificateMaterialFromP12 } from '../../src/fiscal/fiscal-certificate.util';
import { FiscalDocumentRepository } from '../../src/fiscal-documents/fiscal-document.repository';
import { resolveProjectPath } from '../../src/common/utils/project-path.util';
import { LegacySiiClient, SiiEnvironment, TipoDTE } from 'sii-engine';
import { createFiscalTestApp } from './nest-test-app';
import { optionalEnv, prepareRealSiiTestEnv } from './env-loader';

prepareRealSiiTestEnv();

type SuperTestTarget = Parameters<typeof request>[0];

export interface RealSiiLegacyDteScenario {
  tipoDTE: TipoDTE;
  label: string;
  endpoint: string;
  artifactSlug: string;
  buildDocument(input: BuildDocumentInput): LegacyDocumentPayload;
}

interface BuildDocumentInput {
  tipoDTE: TipoDTE;
  today: string;
  forcedFolio?: number;
  rutEmisor: string;
  razonSocial?: string;
}

interface LegacyDocumentPayload {
  idDoc: Record<string, unknown>;
  emisor: Record<string, unknown>;
  receptor: Record<string, unknown>;
  detalles: Array<Record<string, unknown>>;
  referencias?: Array<Record<string, unknown>>;
  totales: Record<string, unknown>;
}

interface FiscalIssuerApiData {
  tenantId: string;
  rutEmisor: string;
  environment: SiiEnvironment;
  custodyMode: string;
}

interface EmitLegacyApiData {
  internalId: string;
  trackId: string;
  folio: number;
  status: string;
}

interface SendStatusApiData {
  trackId: string;
  normalizedStatus: string;
  estadisticas?: {
    aceptados?: number;
    rechazados?: number;
    reparos?: number;
  };
}

interface DteStatusApiData {
  tipoDTE: number;
  folio: number;
  status: string;
}

interface PrintedSampleApiData {
  tipoDTE: number;
  folio: number;
}

interface CafRequestApiData {
  status: string;
  detail?: string;
  retryable?: boolean;
}

export function runRealSiiLegacyDteSmoke(
  suiteName: string,
  scenarios: RealSiiLegacyDteScenario[],
): void {
  jest.setTimeout(360000);

  describe(suiteName, () => {
    let app: INestApplication;
    let apiKey: string;

    const tenantId =
      optionalEnv('REAL_SII_TEST_LEGACY_TENANT_ID') ||
      optionalEnv('REAL_SII_TEST_TENANT_ID') ||
      'real-sii-legacy-smoke';
    const merchantId =
      optionalEnv('REAL_SII_TEST_MERCHANT_ID') || 'merchant-main';
    const branchId = optionalEnv('REAL_SII_TEST_BRANCH_ID') || 'branch-001';
    const rutEmisor =
      optionalEnv('REAL_SII_TEST_RUT_EMISOR') ||
      optionalEnv('SII_RUT_EMISOR') ||
      '';
    const rutFirmante =
      optionalEnv('REAL_SII_TEST_RUT_FIRMANTE') ||
      optionalEnv('SII_RUT_FIRMANTE') ||
      '';
    const fechaResolucion =
      optionalEnv('REAL_SII_TEST_FECHA_RESOLUCION') ||
      optionalEnv('SII_FECHA_RESOLUCION') ||
      '';
    const nroResolucionRaw =
      optionalEnv('REAL_SII_TEST_NRO_RESOLUCION') ||
      optionalEnv('SII_NRO_RESOLUCION') ||
      '';
    const nroResolucion = Number(nroResolucionRaw);
    const pfxPath = resolveRealSiiTestPfxPath();
    const pfxPassword =
      optionalEnv('REAL_SII_TEST_PFX_PASSWORD') ??
      optionalEnv('SII_PFX_PASSWORD') ??
      '';
    const environment = parseEnvironment(
      optionalEnv('REAL_SII_TEST_ENVIRONMENT') || 'CERTIFICACION',
    );

    beforeAll(async () => {
      assertRealSiiPrerequisites({
        rutEmisor,
        rutFirmante,
        fechaResolucion,
        nroResolucion,
        nroResolucionRaw,
        pfxPath,
        pfxPassword,
      });

      loadCertificateMaterialFromP12(
        readFileSync(pfxPath),
        pfxPassword,
        rutFirmante,
      );

      apiKey = process.env.API_KEY_FRONTEND || 'dev-ministack-key';
      app = await createFiscalTestApp();

      const pfxBase64 = readFileSync(pfxPath).toString('base64');
      const upsertResponse = await request(testServer(app))
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
          pfxBase64,
          pfxPassword,
          rutFirmante,
        })
        .expect(201);

      const upsertData = responseData<FiscalIssuerApiData>(upsertResponse);
      expect(upsertData).toMatchObject({
        tenantId,
        rutEmisor,
        environment,
        custodyMode: 'aws',
      });

      const contextResolver = app.get(FiscalContextResolver);
      const tokenProvider = app.get(FiscalTokenProvider);
      const context = await contextResolver.resolve({
        tenantId,
        rutEmisor,
        environment,
      });
      const token = await tokenProvider.getToken(
        context,
        app.get(FISCAL_SIGNING_PROVIDER),
      );
      expect(token.token).toBeTruthy();
    });

    afterAll(async () => {
      if (app) await app.close();
      jest.restoreAllMocks();
    });

    for (const scenario of scenarios) {
      describe(`${scenario.label} (${scenario.tipoDTE})`, () => {
        let internalId: string | undefined;
        let trackId: string | undefined;
        let blocker: string | undefined;

        it(`ensures CAF ${scenario.tipoDTE} is available`, async () => {
          await ensureUsableCafAvailable({
            app,
            apiKey,
            tenantId,
            merchantId,
            branchId,
            rutEmisor,
            environment,
            scenario,
            cafQuantity: cafQuantityFor(scenario.tipoDTE),
            existingCafPath: resolveOptionalCafPath(scenario.tipoDTE),
            allowRequest: !parseBooleanEnv(
              optionalEnv('REAL_SII_TEST_SKIP_CAF_REQUEST'),
            ),
            onExternalBlocker: (message) => {
              blocker = message;
            },
          });
        });

        it(`emits ${scenario.label} in SII certification`, async () => {
          if (blocker) {
            throw new Error(
              `No se ejecuta emision real DTE ${scenario.tipoDTE}. ${blocker}`,
            );
          }

          await ensureUsableCafAvailable({
            app,
            apiKey,
            tenantId,
            merchantId,
            branchId,
            rutEmisor,
            environment,
            scenario,
            cafQuantity: cafQuantityFor(scenario.tipoDTE),
            existingCafPath: resolveOptionalCafPath(scenario.tipoDTE),
            allowRequest: false,
            onExternalBlocker: (message) => {
              blocker = message;
            },
          });

          const today = new Date().toISOString().slice(0, 10);
          const activeCafRazonSocial = await resolveActiveCafRazonSocial({
            app,
            apiKey,
            tenantId,
            rutEmisor,
            environment,
            tipoDTE: scenario.tipoDTE,
          });
          const sendSpy = captureLegacyUploadAttempts(scenario);
          const response = await request(testServer(app))
            .post(scenario.endpoint)
            .set('x-api-key', apiKey)
            .send({
              context: {
                tenantId,
                merchantId,
                branchId,
                rutEmisor,
                environment,
              },
              document: scenario.buildDocument({
                tipoDTE: scenario.tipoDTE,
                today,
                forcedFolio: forcedFolioFor(scenario.tipoDTE),
                rutEmisor,
                razonSocial: activeCafRazonSocial,
              }),
            });

          sendSpy.mockRestore();

          if (response.status !== 201) {
            writeLastUploadError(scenario, response.body);
            throw new Error(
              `La emision real DTE ${scenario.tipoDTE} esperaba HTTP 201 y recibio ${response.status}. Body: ${JSON.stringify(
                response.body,
              )}`,
            );
          }

          const emitData = responseData<EmitLegacyApiData>(response);
          internalId = emitData.internalId;
          trackId = emitData.trackId;

          expect(emitData.internalId).toBeTruthy();
          expect(emitData.trackId).toBeTruthy();
          expect(emitData.folio).toBeGreaterThan(0);
          expect(emitData.status).toBeTruthy();
          expect(JSON.stringify(response.body)).not.toMatch(secretLeakPattern());

          writeDebugArtifacts(app, scenario, {
            internalId,
            tenantId,
            rutEmisor,
            environment,
            trackId,
          });
        });

        it(`queries ${scenario.label} send status cleanly`, async () => {
          const emitted = requireEmissionState({
            internalId,
            trackId,
            tipoDTE: scenario.tipoDTE,
            blocker,
          });

          let statusData: SendStatusApiData | undefined;
          let lastStatusBody: unknown;
          const attempts =
            parseOptionalPositiveInt(
              optionalEnv('REAL_SII_TEST_LEGACY_STATUS_POLL_ATTEMPTS'),
              'REAL_SII_TEST_LEGACY_STATUS_POLL_ATTEMPTS',
            ) ?? 6;
          const delayMs =
            parseOptionalPositiveInt(
              optionalEnv('REAL_SII_TEST_LEGACY_STATUS_POLL_DELAY_MS'),
              'REAL_SII_TEST_LEGACY_STATUS_POLL_DELAY_MS',
            ) ?? 10000;

          for (let attempt = 1; attempt <= attempts; attempt += 1) {
            if (attempt > 1) await delay(delayMs);

            const response = await request(testServer(app))
              .get(`/api/fiscal/documents/${emitted.internalId}/status`)
              .set('x-api-key', apiKey)
              .query({
                tenantId,
                rutEmisor,
                environment,
              })
              .expect(200);

            lastStatusBody = response.body;
            statusData = responseData<SendStatusApiData>(response);
            if (statusData.estadisticas) break;
          }

          expect(statusData).toBeDefined();
          statusData = statusData!;
          expect(statusData.trackId).toBe(emitted.trackId);
          expect(statusData.estadisticas).toEqual(
            expect.objectContaining({
              aceptados: expect.any(Number),
              rechazados: 0,
              reparos: 0,
            }),
          );
          expect(statusData.estadisticas?.aceptados ?? 0).toBeGreaterThan(0);
          expect(JSON.stringify(lastStatusBody)).not.toMatch(secretLeakPattern());
        });

        it(`queries ${scenario.label} DTE status and printed sample`, async () => {
          const emitted = requireEmissionState({
            internalId,
            trackId,
            tipoDTE: scenario.tipoDTE,
            blocker,
          });

          const dteStatusResponse = await request(testServer(app))
            .get(`/api/fiscal/documents/${emitted.internalId}/dte-status`)
            .set('x-api-key', apiKey)
            .query({
              tenantId,
              rutEmisor,
              environment,
            })
            .expect(200);

          const dteStatus = responseData<DteStatusApiData>(dteStatusResponse);
          expect(dteStatus.tipoDTE).toBe(scenario.tipoDTE);
          expect(dteStatus.folio).toBeGreaterThan(0);
          expect(dteStatus.status).toBeTruthy();
          expect(JSON.stringify(dteStatusResponse.body)).not.toMatch(
            secretLeakPattern(),
          );

          const printedSampleResponse = await request(testServer(app))
            .get(`/api/fiscal/documents/${emitted.internalId}/printed-sample`)
            .set('x-api-key', apiKey)
            .expect(200);

          const printedSample = responseData<PrintedSampleApiData>(
            printedSampleResponse,
          );
          expect(printedSample.tipoDTE).toBe(scenario.tipoDTE);
          expect(printedSample.folio).toBeGreaterThan(0);
          expect(JSON.stringify(printedSampleResponse.body)).not.toMatch(
            secretLeakPattern(),
          );
        });
      });
    }
  });
}

export function commonEmisor(input: BuildDocumentInput): Record<string, unknown> {
  return {
    rutEmisor: input.rutEmisor,
    rznSoc:
      optionalEnv('REAL_SII_TEST_EMISOR_RAZON_SOCIAL') ||
      input.razonSocial ||
      'PRUEBA CERTIFICACION SII',
    giroEmis:
      optionalEnv('REAL_SII_TEST_EMISOR_GIRO') || 'SERVICIOS INFORMATICOS',
    acteco: Number(optionalEnv('REAL_SII_TEST_EMISOR_ACTECO') || 620200),
    dirOrigen:
      optionalEnv('REAL_SII_TEST_EMISOR_DIRECCION') || 'AV. PROVIDENCIA 123',
    cmnaOrigen: optionalEnv('REAL_SII_TEST_EMISOR_COMUNA') || 'PROVIDENCIA',
    ciudadOrigen: optionalEnv('REAL_SII_TEST_EMISOR_CIUDAD') || 'SANTIAGO',
  };
}

export function commonReceptor(prefix: string): Record<string, unknown> {
  return {
    rutRecep:
      optionalEnv(`${prefix}_RECEPTOR_RUT`) ||
      optionalEnv('REAL_SII_TEST_RECEPTOR_RUT') ||
      '60803000-K',
    rznSocRecep:
      optionalEnv(`${prefix}_RECEPTOR_RAZON_SOCIAL`) ||
      optionalEnv('REAL_SII_TEST_RECEPTOR_RAZON_SOCIAL') ||
      'SERVICIO DE IMPUESTOS INTERNOS',
    giroRecep:
      optionalEnv(`${prefix}_RECEPTOR_GIRO`) ||
      optionalEnv('REAL_SII_TEST_RECEPTOR_GIRO') ||
      'ADMINISTRACION PUBLICA',
    dirRecep:
      optionalEnv(`${prefix}_RECEPTOR_DIRECCION`) ||
      optionalEnv('REAL_SII_TEST_RECEPTOR_DIRECCION') ||
      'TEATINOS 120',
    cmnaRecep:
      optionalEnv(`${prefix}_RECEPTOR_COMUNA`) ||
      optionalEnv('REAL_SII_TEST_RECEPTOR_COMUNA') ||
      'SANTIAGO',
    ciudadRecep:
      optionalEnv(`${prefix}_RECEPTOR_CIUDAD`) ||
      optionalEnv('REAL_SII_TEST_RECEPTOR_CIUDAD') ||
      'SANTIAGO',
  };
}

export function originReference(codRef: 1 | 2 | 3, razonRef: string) {
  return {
    nroLinRef: 1,
    tipoDTERef: optionalEnv('REAL_SII_TEST_NOTE_REFERENCE_TIPO_DTE') || '33',
    folioRef: Number(
      optionalEnv('REAL_SII_TEST_NOTE_REFERENCE_FOLIO') ||
        optionalEnv('REAL_SII_TEST_FACTURA33_ACCEPTED_FOLIO') ||
        10,
    ),
    fechaRef:
      optionalEnv('REAL_SII_TEST_NOTE_REFERENCE_FECHA') ||
      optionalEnv('REAL_SII_TEST_FACTURA33_ACCEPTED_FECHA') ||
      '2026-06-29',
    codRef,
    razonRef,
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

function assertRealSiiPrerequisites(input: {
  rutEmisor: string;
  rutFirmante: string;
  fechaResolucion: string;
  nroResolucion: number;
  nroResolucionRaw: string;
  pfxPath: string;
  pfxPassword: string;
}): void {
  if (!input.rutEmisor) {
    throw new Error('Falta REAL_SII_TEST_RUT_EMISOR o SII_RUT_EMISOR.');
  }
  if (!existsSync(input.pfxPath)) {
    throw new Error(`Falta el archivo PFX real en ${input.pfxPath}.`);
  }
  if (!input.pfxPassword.trim()) {
    throw new Error('Falta REAL_SII_TEST_PFX_PASSWORD o SII_PFX_PASSWORD.');
  }
  if (!input.rutFirmante) {
    throw new Error('Falta REAL_SII_TEST_RUT_FIRMANTE o SII_RUT_FIRMANTE.');
  }
  if (!input.fechaResolucion.trim()) {
    throw new Error(
      'Falta REAL_SII_TEST_FECHA_RESOLUCION o SII_FECHA_RESOLUCION.',
    );
  }
  if (!Number.isInteger(input.nroResolucion) || input.nroResolucion < 0) {
    throw new Error(
      `REAL_SII_TEST_NRO_RESOLUCION o SII_NRO_RESOLUCION es invalido (${input.nroResolucionRaw || 'vacio'}).`,
    );
  }
}

async function ensureUsableCafAvailable(input: {
  app: INestApplication;
  apiKey: string;
  tenantId: string;
  merchantId: string;
  branchId: string;
  rutEmisor: string;
  environment: SiiEnvironment;
  scenario: RealSiiLegacyDteScenario;
  cafQuantity: number;
  existingCafPath?: string;
  allowRequest: boolean;
  onExternalBlocker?: (message: string) => void;
}): Promise<void> {
  const initialStatusResponse = await request(testServer(input.app))
    .get('/api/fiscal/folios/status')
    .set('x-api-key', input.apiKey)
    .query({
      tenantId: input.tenantId,
      rutEmisor: input.rutEmisor,
      environment: input.environment,
      tipoDTE: input.scenario.tipoDTE,
    })
    .expect(200);

  if (hasActiveCaf(responseData<unknown>(initialStatusResponse))) return;

  if (input.existingCafPath) {
    await importExistingCaf(input);
    const importedStatusResponse = await request(testServer(input.app))
      .get('/api/fiscal/folios/status')
      .set('x-api-key', input.apiKey)
      .query({
        tenantId: input.tenantId,
        rutEmisor: input.rutEmisor,
        environment: input.environment,
        tipoDTE: input.scenario.tipoDTE,
      })
      .expect(200);

    if (hasActiveCaf(responseData<unknown>(importedStatusResponse))) return;

    const blocker = `Se importo CAF ${input.scenario.tipoDTE} desde ${input.existingCafPath}, pero no quedo activo con folios disponibles.`;
    input.onExternalBlocker?.(blocker);
    throw new Error(blocker);
  }

  if (!input.allowRequest) {
    const blocker = `No existe CAF ${input.scenario.tipoDTE} activo y REAL_SII_TEST_SKIP_CAF_REQUEST impide solicitar uno nuevo.`;
    input.onExternalBlocker?.(blocker);
    throw new Error(blocker);
  }

  const cafResponse = await request(testServer(input.app))
    .post('/api/fiscal/folios/requests')
    .set('x-api-key', input.apiKey)
    .send({
      context: {
        tenantId: input.tenantId,
        merchantId: input.merchantId,
        branchId: input.branchId,
        rutEmisor: input.rutEmisor,
        environment: input.environment,
      },
      tipoDTE: input.scenario.tipoDTE,
      quantity: input.cafQuantity,
      idempotencyKey: `real-sii-caf-${input.scenario.tipoDTE}-${new Date()
        .toISOString()
        .replace(/[^0-9]/g, '')}`,
    });

  if (cafResponse.status !== 201) {
    writeCafAcquisitionError(input.scenario, cafResponse.body);
    const blocker = `La solicitud real de CAF ${input.scenario.tipoDTE} esperaba HTTP 201 y recibio ${cafResponse.status}. Body publico: ${JSON.stringify(cafResponse.body)}`;
    input.onExternalBlocker?.(blocker);
    throw new Error(blocker);
  }

  const cafData = responseData<CafRequestApiData>(cafResponse);
  if (cafData.status !== 'imported') {
    writeCafAcquisitionError(input.scenario, cafResponse.body);
    const blocker = cafAcquisitionBlockerMessage(
      input.scenario.tipoDTE,
      cafData,
      cafResponse.body,
    );
    input.onExternalBlocker?.(blocker);
    throw new Error(blocker);
  }
  expect(JSON.stringify(cafResponse.body)).not.toMatch(secretLeakPattern());

  const finalStatusResponse = await request(testServer(input.app))
    .get('/api/fiscal/folios/status')
    .set('x-api-key', input.apiKey)
    .query({
      tenantId: input.tenantId,
      rutEmisor: input.rutEmisor,
      environment: input.environment,
      tipoDTE: input.scenario.tipoDTE,
    })
    .expect(200);

  expect(hasActiveCaf(responseData<unknown>(finalStatusResponse))).toBe(true);
}

async function importExistingCaf(input: {
  app: INestApplication;
  apiKey: string;
  tenantId: string;
  merchantId: string;
  branchId: string;
  rutEmisor: string;
  environment: SiiEnvironment;
  scenario: RealSiiLegacyDteScenario;
  existingCafPath?: string;
}): Promise<void> {
  if (!input.existingCafPath || !existsSync(input.existingCafPath)) {
    throw new Error(`CAF ${input.scenario.tipoDTE} inexistente.`);
  }

  const importResponse = await request(testServer(input.app))
    .post('/api/fiscal/folios/cafs')
    .set('x-api-key', input.apiKey)
    .send({
      context: {
        tenantId: input.tenantId,
        merchantId: input.merchantId,
        branchId: input.branchId,
        rutEmisor: input.rutEmisor,
        environment: input.environment,
      },
      cafXml: readFileSync(input.existingCafPath, 'utf8'),
    })
    .expect(201);

  expect(JSON.stringify(importResponse.body)).not.toMatch(secretLeakPattern());
}

function hasActiveCaf(statuses: unknown): boolean {
  if (!Array.isArray(statuses)) return false;
  return statuses.some((entry) => {
    const item = entry as { status?: unknown; remaining?: unknown };
    const remaining = Number(item.remaining ?? 0);
    return (
      (item.status === 'active' || item.status === 'expiring_soon') &&
      Number.isFinite(remaining) &&
      remaining > 0
    );
  });
}

function cafAcquisitionBlockerMessage(
  tipoDTE: number,
  cafData: CafRequestApiData,
  publicBody: unknown,
): string {
  const detail = cafData.detail ? ` Detail: ${cafData.detail}` : '';
  const retryable =
    typeof cafData.retryable === 'boolean'
      ? ` Retryable: ${cafData.retryable}.`
      : '';

  return `La solicitud real de CAF ${tipoDTE} esperaba status imported y recibio ${cafData.status}.${retryable}${detail} Body publico: ${JSON.stringify(
    publicBody,
  )}`;
}

function requireEmissionState(input: {
  internalId?: string;
  trackId?: string;
  tipoDTE: number;
  blocker?: string;
}): { internalId: string; trackId: string } {
  if (input.internalId && input.trackId) {
    return { internalId: input.internalId, trackId: input.trackId };
  }

  throw new Error(
    `No hay DTE ${input.tipoDTE} emitido para consultar. Causa: ${
      input.blocker ?? 'internalId/trackId no fueron generados.'
    }`,
  );
}

function parseEnvironment(value: string): SiiEnvironment {
  const normalized = value.trim().toUpperCase();
  return normalized === 'PRODUCCION' ||
    normalized === 'PRODUCTION' ||
    normalized === '1'
    ? SiiEnvironment.Produccion
    : SiiEnvironment.Certificacion;
}

function parseBooleanEnv(value?: string): boolean {
  if (!value) return false;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function parseOptionalPositiveInt(
  value: string | undefined,
  envName: string,
): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${envName} debe ser un entero positivo.`);
  }
  return parsed;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveRealSiiTestPfxPath(): string {
  const configuredPath = optionalEnv('REAL_SII_TEST_PFX_PATH');
  if (configuredPath) return resolveProjectPath(configuredPath);

  const candidates = [
    'secure/real-sii-tests/certificado.pfx',
    'secure/certificado.pfx',
  ].map((candidate) => resolveProjectPath(candidate));

  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}

function resolveOptionalCafPath(tipoDTE: number): string | undefined {
  const configuredPath =
    optionalEnv(`REAL_SII_TEST_DTE_${tipoDTE}_CAF_PATH`) ||
    optionalEnv(`REAL_SII_TEST_CAF_${tipoDTE}_PATH`);

  return configuredPath ? resolveProjectPath(configuredPath) : undefined;
}

function cafQuantityFor(tipoDTE: number): number {
  return Number(
    optionalEnv(`REAL_SII_TEST_DTE_${tipoDTE}_CAF_QUANTITY`) ||
      optionalEnv('REAL_SII_TEST_LEGACY_CAF_QUANTITY') ||
      optionalEnv('REAL_SII_TEST_CAF_QUANTITY') ||
      '1',
  );
}

function forcedFolioFor(tipoDTE: number): number | undefined {
  return parseOptionalPositiveInt(
    optionalEnv(`REAL_SII_TEST_DTE_${tipoDTE}_FOLIO`),
    `REAL_SII_TEST_DTE_${tipoDTE}_FOLIO`,
  );
}

type LegacySend = (
  ...args: Parameters<LegacySiiClient['send']>
) => ReturnType<LegacySiiClient['send']>;

function captureLegacyUploadAttempts(
  scenario: RealSiiLegacyDteScenario,
): jest.SpyInstance {
  const originalSendCandidate: unknown = Object.getOwnPropertyDescriptor(
    LegacySiiClient.prototype,
    'send',
  )?.value;

  if (typeof originalSendCandidate !== 'function') {
    throw new Error('No se pudo capturar LegacySiiClient.send original.');
  }

  const originalSend = originalSendCandidate as LegacySend;

  return jest
    .spyOn(LegacySiiClient.prototype, 'send')
    .mockImplementation(async function (
      this: LegacySiiClient,
      ...params: Parameters<LegacySiiClient['send']>
    ) {
      const [signedEnvelope] = params;
      writeUploadAttemptArtifacts(scenario, signedEnvelope);
      try {
        return await originalSend.apply(this, params);
      } catch (error) {
        writeLegacyUploadFailureArtifacts(scenario, error);
        throw error;
      }
    });
}

function artifactDirFor(
  scenario: RealSiiLegacyDteScenario,
  folio: string | number,
): string {
  return resolveProjectPath(
    `secure/real-sii-tests/artifacts/${scenario.artifactSlug}/${folio}`,
  );
}

function writeUploadAttemptArtifacts(
  scenario: RealSiiLegacyDteScenario,
  signedEnvelope: string,
): void {
  const folio = extractXmlValue(signedEnvelope, 'Folio') ?? 'unknown';
  const artifactDir = artifactDirFor(scenario, folio);
  mkdirSync(artifactDir, { recursive: true });

  writeFileSync(
    join(artifactDir, 'signed-envio-dte-attempt.xml'),
    signedEnvelope,
  );

  const tedXml = extractXmlBlock(signedEnvelope, 'TED');
  if (tedXml) writeFileSync(join(artifactDir, 'ted-attempt.xml'), tedXml);

  const dteXml = extractXmlBlock(signedEnvelope, 'DTE');
  if (dteXml) writeFileSync(join(artifactDir, 'signed-dte-attempt.xml'), dteXml);
}

function writeLegacyUploadFailureArtifacts(
  scenario: RealSiiLegacyDteScenario,
  error: unknown,
): void {
  const artifactDir = resolveProjectPath(
    `secure/real-sii-tests/artifacts/${scenario.artifactSlug}/last-failed-upload`,
  );
  mkdirSync(artifactDir, { recursive: true });

  const rawResponse =
    typeof error === 'object' &&
    error !== null &&
    'rawResponse' in error &&
    typeof (error as { rawResponse?: unknown }).rawResponse === 'string'
      ? (error as { rawResponse: string }).rawResponse
      : undefined;

  writeFileSync(
    join(artifactDir, 'error-summary.json'),
    JSON.stringify(
      {
        name: error instanceof Error ? error.name : typeof error,
        message: error instanceof Error ? error.message : String(error),
        code:
          typeof error === 'object' && error !== null && 'code' in error
            ? String((error as { code?: unknown }).code ?? '')
            : undefined,
        hasRawResponse: Boolean(rawResponse),
      },
      null,
      2,
    ),
  );

  if (rawResponse) {
    writeFileSync(
      join(artifactDir, 'raw-upload-response.txt'),
      sanitizeDiagnosticText(rawResponse),
    );
  }
}

function writeLastUploadError(
  scenario: RealSiiLegacyDteScenario,
  body: unknown,
): void {
  const artifactDir = resolveProjectPath(
    `secure/real-sii-tests/artifacts/${scenario.artifactSlug}/last-failed-upload`,
  );
  mkdirSync(artifactDir, { recursive: true });
  writeFileSync(
    join(artifactDir, 'response-body.json'),
    JSON.stringify(body, null, 2),
  );
}

function writeCafAcquisitionError(
  scenario: RealSiiLegacyDteScenario,
  body: unknown,
): void {
  const artifactDir = resolveProjectPath(
    `secure/real-sii-tests/artifacts/${scenario.artifactSlug}/last-failed-caf-acquisition`,
  );
  mkdirSync(artifactDir, { recursive: true });
  writeFileSync(
    join(artifactDir, 'response-body.json'),
    JSON.stringify(body, null, 2),
  );
}

function writeDebugArtifacts(
  app: INestApplication,
  scenario: RealSiiLegacyDteScenario,
  input: {
    internalId: string;
    tenantId: string;
    rutEmisor: string;
    environment: SiiEnvironment;
    trackId?: string;
  },
): void {
  const repository = app.get(FiscalDocumentRepository);
  const record = repository.findById(input.internalId);
  if (!record) return;

  const artifactDir = artifactDirFor(scenario, record.folio);
  mkdirSync(artifactDir, { recursive: true });

  if (record.tedXml) writeFileSync(join(artifactDir, 'ted.xml'), record.tedXml);
  if (record.signedDteXml) {
    writeFileSync(join(artifactDir, 'signed-dte.xml'), record.signedDteXml);
  }
  if (record.signedEnvelopeXml) {
    writeFileSync(
      join(artifactDir, 'signed-envio-dte.xml'),
      record.signedEnvelopeXml,
    );
  }

  writeFileSync(
    join(artifactDir, 'metadata.json'),
    JSON.stringify(
      {
        internalId: input.internalId,
        folio: record.folio,
        trackId: input.trackId,
        tenantId: input.tenantId,
        rutEmisor: input.rutEmisor,
        environment: input.environment,
        tipoDTE: record.tipoDTE,
        writtenAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
}

async function resolveActiveCafRazonSocial(input: {
  app: INestApplication;
  apiKey: string;
  tenantId: string;
  rutEmisor: string;
  environment: SiiEnvironment;
  tipoDTE: TipoDTE;
}): Promise<string | undefined> {
  try {
    const statusResponse = await request(testServer(input.app))
      .get('/api/fiscal/folios/status')
      .set('x-api-key', input.apiKey)
      .query({
        tenantId: input.tenantId,
        rutEmisor: input.rutEmisor,
        environment: input.environment,
        tipoDTE: input.tipoDTE,
      })
      .expect(200);

    const statuses = responseData<unknown>(statusResponse);
    if (!Array.isArray(statuses)) return undefined;

    for (const entry of statuses) {
      const item = entry as {
        status?: string;
        remaining?: number;
        caf?: { razonSocial?: string };
      };
      if (
        (item.status === 'active' || item.status === 'expiring_soon') &&
        Number(item.remaining ?? 0) > 0 &&
        item.caf?.razonSocial
      ) {
        return item.caf.razonSocial;
      }
    }
  } catch {
    // Non-critical: fall through to configured/default issuer name.
  }
  return undefined;
}

function sanitizeDiagnosticText(value: string): string {
  return value
    .replace(/TOKEN=[^;"'\s<]+/gi, 'TOKEN=[REDACTED]')
    .replace(/<TOKEN>[\s\S]*?<\/TOKEN>/gi, '<TOKEN>[REDACTED]</TOKEN>')
    .replace(/<RSASK>[\s\S]*?<\/RSASK>/gi, '<RSASK>[REDACTED]</RSASK>')
    .replace(
      /<X509Certificate>[\s\S]*?<\/X509Certificate>/gi,
      '<X509Certificate>[REDACTED]</X509Certificate>',
    );
}

function extractXmlValue(xml: string, tagName: string): string | undefined {
  const match = xml.match(
    new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)</${tagName}>`, 'i'),
  );
  const value = match?.[1]?.trim();
  return value ? value : undefined;
}

function extractXmlBlock(xml: string, tagName: string): string | undefined {
  const match = xml.match(
    new RegExp(`<${tagName}\\b[^>]*>[\\s\\S]*?</${tagName}>`, 'i'),
  );
  return match?.[0];
}

function secretLeakPattern(): RegExp {
  return /RSASK|rawXml|<CAF|PRIVATE KEY|token|password|pfx|PFX/i;
}
