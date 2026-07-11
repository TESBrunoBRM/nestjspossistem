import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { mkdirSync } from 'fs';
import { INestApplication } from '@nestjs/common';
import {
  LegacySiiClient,
  normalizeRut,
  SiiEnvironment,
  TipoDTE,
  type CafWithStatus,
} from 'sii-engine';
import { FiscalContextResolver } from '../src/fiscal/fiscal-context.resolver';
import { FiscalTokenProvider } from '../src/fiscal/fiscal-token.provider';
import { FISCAL_SIGNING_PROVIDER } from '../src/fiscal/fiscal-provider.tokens';
import { FISCAL_FOLIO_PROVIDER } from '../src/fiscal-documents/fiscal-documents.tokens';
import { resolveProjectPath } from '../src/common/utils/project-path.util';
import { createFiscalTestApp } from './support/nest-test-app';
import { optionalEnv, prepareRealSiiTestEnv } from './support/env-loader';
import {
  assertNormalSmokeDteStatus,
  assertNormalSmokeSendStatus,
} from './support/sii-smoke-assertions';

prepareRealSiiTestEnv();

jest.setTimeout(300000);

describe('Real SII recovery for an already-reserved factura 33 folio', () => {
  let app: INestApplication;

  const tenantId =
    optionalEnv('REAL_SII_TEST_FACTURA33_TENANT_ID') ||
    optionalEnv('REAL_SII_TEST_TENANT_ID') ||
    'real-sii-factura33-smoke';
  const rutEmisor =
    optionalEnv('REAL_SII_TEST_RUT_EMISOR') ||
    optionalEnv('SII_RUT_EMISOR') ||
    '';
  const environment = parseEnvironment(
    optionalEnv('REAL_SII_TEST_ENVIRONMENT') || 'CERTIFICACION',
  );
  const confirmedFolio = Number(
    optionalEnv('REAL_SII_TEST_RETRY_CONFIRMED_FOLIO') || '',
  );
  const settleDelayMs = Number(
    optionalEnv('REAL_SII_TEST_STATUS_SETTLE_MS') || '5000',
  );
  const dryRun =
    optionalEnv('REAL_SII_TEST_RETRY_DRY_RUN')?.toLowerCase() === 'true';
  const envelopePath = resolveProjectPath(
    optionalEnv('REAL_SII_TEST_RETRY_ENVELOPE_PATH') ||
      `secure/real-sii-tests/artifacts/factura33/${confirmedFolio}/signed-envio-dte-attempt.xml`,
  );
  const retryResultPath = join(dirname(envelopePath), 'retry-result.json');

  beforeAll(async () => {
    if (environment !== SiiEnvironment.Certificacion) {
      throw new Error(
        'El retry de factura 33 solo puede ejecutarse en CERTIFICACION.',
      );
    }
    if (!rutEmisor) {
      throw new Error('Falta REAL_SII_TEST_RUT_EMISOR para el retry.');
    }
    if (!Number.isInteger(confirmedFolio) || confirmedFolio <= 0) {
      throw new Error(
        'El retry requiere REAL_SII_TEST_RETRY_CONFIRMED_FOLIO con un folio positivo como confirmacion explicita.',
      );
    }
    if (!existsSync(envelopePath)) {
      throw new Error(
        `No existe el EnvioDTE firmado que debe reintentarse: ${envelopePath}`,
      );
    }
    if (
      !Number.isInteger(settleDelayMs) ||
      settleDelayMs < 0 ||
      settleDelayMs > 60000
    ) {
      throw new Error(
        'REAL_SII_TEST_STATUS_SETTLE_MS debe estar entre 0 y 60000.',
      );
    }

    app = await createFiscalTestApp();
  });

  afterAll(async () => {
    if (app) await app.close();
    jest.restoreAllMocks();
  });

  it('resends the exact signed envelope without reserving another folio', async () => {
    const signedEnvelope = readFileSync(envelopePath, 'utf8');
    const envelope = parseRetryEnvelope(signedEnvelope);
    expect(envelope.folio).toBe(confirmedFolio);
    expect(envelope.tipoDTE).toBe(TipoDTE.FacturaElectronica);
    expect(normalizeRut(envelope.rutEmisor)).toBe(normalizeRut(rutEmisor));
    expect(signedEnvelope).toContain('<Signature');
    if (dryRun) {
      retryLog(
        `Validacion offline correcta: EnvioDTE firmado, folio ${confirmedFolio}, DTE 33 y RUT emisor coincidente`,
      );
      return;
    }

    const contextResolver = app.get(FiscalContextResolver);
    const tokenProvider = app.get(FiscalTokenProvider);
    const signingProvider = app.get(FISCAL_SIGNING_PROVIDER);
    const folioProvider = app.get<{
      getStatus: (
        context: unknown,
        tipoDTE: TipoDTE,
      ) => Promise<CafWithStatus[]>;
      getNextFolio: (...args: unknown[]) => Promise<unknown>;
      reserveFolio: (...args: unknown[]) => Promise<unknown>;
    }>(FISCAL_FOLIO_PROVIDER);
    const getNextFolioSpy = jest.spyOn(folioProvider, 'getNextFolio');
    const reserveFolioSpy = jest.spyOn(folioProvider, 'reserveFolio');

    const context = await contextResolver.resolve({
      tenantId,
      rutEmisor,
      environment,
    });
    const custodyBefore = summarizeCafState(
      await folioProvider.getStatus(context, TipoDTE.FacturaElectronica),
    );
    const token = await tokenProvider.getToken(context, signingProvider);
    const certificate = await signingProvider.getSigningMaterial(context);
    const client = new LegacySiiClient();

    let retryResult = readRetryResult(retryResultPath, confirmedFolio);
    if (!retryResult) {
      retryLog(
        `Reenviando exactamente el EnvioDTE firmado del folio ${confirmedFolio}`,
      );
      const sendResult = await client.send(
        signedEnvelope,
        context,
        token.token,
        certificate.rutFirmante,
      );
      retryResult = {
        folio: confirmedFolio,
        trackId: sendResult.trackId,
        sendStatus: sendResult.status,
        sentAt: new Date().toISOString(),
      };
      writeRetryResult(retryResultPath, retryResult);
      assertNormalSmokeSendStatus(
        sendResult.status,
        `Reenvio exacto de factura 33 folio ${confirmedFolio}`,
        sendResult.detail,
      );
    } else {
      retryLog(
        `TrackId persistido encontrado; no se reenvia el folio ${confirmedFolio} y solo se consulta estado`,
      );
    }

    expect(retryResult.trackId).toBeTruthy();
    await delay(settleDelayMs);

    const sendStatus = await client.queryStatus(
      retryResult.trackId,
      context,
      token.token,
    );
    assertNormalSmokeSendStatus(
      sendStatus.status,
      `Estado del reenvio factura 33 folio ${confirmedFolio}`,
      sendStatus.detail,
      sendStatus.estadisticas,
    );

    const dteStatus = await client.queryDteStatus(
      {
        rutConsultante: splitRut(certificate.rutFirmante).body,
        dvConsultante: splitRut(certificate.rutFirmante).dv,
        tipoDTE: envelope.tipoDTE,
        folio: envelope.folio,
        fechaEmision: envelope.fechaEmision,
        montoTotal: envelope.montoTotal,
        rutReceptor: splitRut(envelope.rutReceptor).body,
        dvReceptor: splitRut(envelope.rutReceptor).dv,
        token: token.token,
      },
      context,
      token.token,
    );
    assertNormalSmokeDteStatus(
      dteStatus.status,
      `Estado DTE factura 33 folio ${confirmedFolio}`,
      dteStatus.glosa,
    );

    const custodyAfter = summarizeCafState(
      await folioProvider.getStatus(context, TipoDTE.FacturaElectronica),
    );
    expect(custodyAfter).toEqual(custodyBefore);
    expect(getNextFolioSpy).not.toHaveBeenCalled();
    expect(reserveFolioSpy).not.toHaveBeenCalled();
    retryLog(
      `Retry completado con trackId persistido; custodia CAF sin cambios`,
    );
  });
});

interface RetryEnvelopeData {
  folio: number;
  tipoDTE: TipoDTE;
  rutEmisor: string;
  rutReceptor: string;
  fechaEmision: string;
  montoTotal: number;
}

interface RetryResult {
  folio: number;
  trackId: string;
  sendStatus: string;
  sentAt: string;
}

function parseRetryEnvelope(xml: string): RetryEnvelopeData {
  if (!/<EnvioDTE\b/i.test(xml)) {
    throw new Error('El artefacto de retry no contiene EnvioDTE.');
  }
  const folio = Number(requiredXmlValue(xml, 'Folio'));
  const tipoDTE = Number(requiredXmlValue(xml, 'TipoDTE')) as TipoDTE;
  const montoTotal = Number(requiredXmlValue(xml, 'MntTotal'));
  if (!Number.isInteger(folio) || folio <= 0) {
    throw new Error('El EnvioDTE de retry no contiene un folio valido.');
  }
  if (!Number.isInteger(montoTotal) || montoTotal <= 0) {
    throw new Error('El EnvioDTE de retry no contiene MntTotal valido.');
  }

  return {
    folio,
    tipoDTE,
    rutEmisor: requiredXmlValue(xml, 'RUTEmisor'),
    rutReceptor: requiredXmlValue(xml, 'RUTRecep'),
    fechaEmision: requiredXmlValue(xml, 'FchEmis'),
    montoTotal,
  };
}

function requiredXmlValue(xml: string, tag: string): string {
  const value = xml
    .match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i'))?.[1]
    ?.trim();
  if (!value) throw new Error(`Falta ${tag} en el EnvioDTE de retry.`);
  return value;
}

function splitRut(rut: string): { body: string; dv: string } {
  const normalized = rut.replace(/\./g, '').toUpperCase();
  const separator = normalized.lastIndexOf('-');
  return separator >= 0
    ? {
        body: normalized.slice(0, separator),
        dv: normalized.slice(separator + 1),
      }
    : { body: normalized.slice(0, -1), dv: normalized.slice(-1) };
}

function summarizeCafState(statuses: CafWithStatus[]): unknown {
  return statuses.map((entry) => ({
    tipoDTE: entry.caf.da.tipoDTE,
    rangeStart: entry.caf.da.rangeStart,
    rangeEnd: entry.caf.da.rangeEnd,
    status: entry.status,
    remaining: entry.remaining,
  }));
}

function readRetryResult(path: string, folio: number): RetryResult | undefined {
  if (!existsSync(path)) return undefined;
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<RetryResult>;
  return parsed.folio === folio &&
    typeof parsed.trackId === 'string' &&
    parsed.trackId
    ? (parsed as RetryResult)
    : undefined;
}

function writeRetryResult(path: string, result: RetryResult): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(result, null, 2));
}

function parseEnvironment(value: string): SiiEnvironment {
  return value.trim().toUpperCase() === 'CERTIFICACION'
    ? SiiEnvironment.Certificacion
    : SiiEnvironment.Produccion;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function retryLog(message: string): void {
  process.stdout.write(
    `[real-sii:factura33:retry] ${new Date().toISOString()} ${message}\n`,
  );
}
