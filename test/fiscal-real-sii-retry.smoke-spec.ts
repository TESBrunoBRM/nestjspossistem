import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { basename, dirname, join } from 'path';
import { INestApplication } from '@nestjs/common';
import {
  isSiiError,
  encodeSiiXml,
  formatSiiTimestamp,
  normalizeRut,
  sanitizeSiiError,
  TipoDTE,
  waitUntilFinal,
  type CafWithStatus,
  type DteStatus,
} from 'sii-engine';
import { FiscalContextResolver } from '../src/fiscal/fiscal-context.resolver';
import { FiscalTokenProvider } from '../src/fiscal/fiscal-token.provider';
import { FiscalCustodyService } from '../src/fiscal-storage/fiscal-custody.service';
import { FISCAL_SIGNING_PROVIDER } from '../src/fiscal/fiscal-provider.tokens';
import { FISCAL_FOLIO_PROVIDER } from '../src/fiscal-documents/fiscal-documents.tokens';
import { resolveProjectPath } from '../src/common/utils/project-path.util';
import { createFiscalTestApp } from './support/nest-test-app';
import { optionalEnv, prepareRealSiiTestEnv } from './support/env-loader';
import {
  parseCertificationDteType,
  parseCertificationEnvironment,
  resolveCertificationTenantId,
} from './support/sii-certification-options';
import {
  assertRetryEnvelopeTimestampIsNotFuture,
  assertRetryEnvelopeTimestampIsFresh,
  createSiiRetryStrategy,
  type RetryEnvelopeData,
} from './support/sii-retry-strategy';
import { validateRetryArtifact } from './support/sii-retry-artifact';
import {
  RetryTrace,
  sha256,
  summarizeSiiResponse,
} from './support/sii-retry-trace';
import { validateXmlAgainstOfficialSchema } from './support/sii-xsd-validator';
import {
  assertNormalSmokeDteStatus,
  assertNormalSmokeSendStatus,
} from './support/sii-smoke-assertions';

prepareRealSiiTestEnv();

jest.setTimeout(300000);

const tipoDTE = parseCertificationDteType(
  optionalEnv('REAL_SII_TEST_RETRY_DTE_TYPE'),
);
const strategy = createSiiRetryStrategy(tipoDTE);

describe(`Real SII recovery for an already-reserved ${strategy.label} folio`, () => {
  let app: INestApplication | undefined;

  const tenantId = resolveCertificationTenantId(tipoDTE);
  const rutEmisor = optionalEnv('REAL_SII_TEST_RUT_EMISOR') || '';
  const rutFirmante = optionalEnv('REAL_SII_TEST_RUT_FIRMANTE') || '';
  const fechaResolucion = optionalEnv('REAL_SII_TEST_FECHA_RESOLUCION') || '';
  const nroResolucionRaw = optionalEnv('REAL_SII_TEST_NRO_RESOLUCION') || '';
  const nroResolucion = Number(nroResolucionRaw);
  const pfxPath = resolveRealSiiTestPfxPath();
  const pfxPassword = optionalEnv('REAL_SII_TEST_PFX_PASSWORD') || '';
  const environment = parseCertificationEnvironment();
  const confirmedFolio = Number(
    optionalEnv('REAL_SII_TEST_RETRY_CONFIRMED_FOLIO') || '',
  );
  const operation = parseRetryOperation(
    optionalEnv('REAL_SII_TEST_RETRY_OPERATION'),
  );
  const pollTimeoutMs = parseBoundedInteger(
    optionalEnv('REAL_SII_TEST_STATUS_POLL_TIMEOUT_MS') || '120000',
    'REAL_SII_TEST_STATUS_POLL_TIMEOUT_MS',
    1,
    300000,
  );
  const pollIntervalMs = parseBoundedInteger(
    optionalEnv('REAL_SII_TEST_STATUS_POLL_INTERVAL_MS') || '10000',
    'REAL_SII_TEST_STATUS_POLL_INTERVAL_MS',
    0,
    60000,
  );
  const sourceEnvelopePath = resolveProjectPath(
    optionalEnv('REAL_SII_TEST_RETRY_ENVELOPE_PATH') ||
      strategy.artifactPath(confirmedFolio),
  );
  const artifactDir = dirname(sourceEnvelopePath);
  const retryResultPath = join(artifactDir, 'retry-result.json');
  const retryAttemptPath = join(artifactDir, 'retry-attempt.json');
  const retryErrorResponsePath = join(artifactDir, 'retry-error-response.txt');
  const retryReconciliationPath = join(
    artifactDir,
    'retry-reconciliation.json',
  );
  const retryPreparationPath = join(artifactDir, 'retry-preparation.json');
  const retryTracePath = join(artifactDir, 'retry-trace.jsonl');
  const trace = new RetryTrace(
    retryTracePath,
    tipoDTE,
    confirmedFolio,
    operation,
  );

  beforeAll(async () => {
    if (!rutEmisor) {
      throw new Error('Falta REAL_SII_TEST_RUT_EMISOR para el retry.');
    }
    if (!Number.isInteger(confirmedFolio) || confirmedFolio <= 0) {
      throw new Error('El retry requiere un folio positivo confirmado.');
    }
    if (!existsSync(sourceEnvelopePath)) {
      throw new Error(
        `No existe el sobre firmado que debe recuperarse: ${sourceEnvelopePath}`,
      );
    }
    if (operation === 'prepare' && !strategy.prepare) {
      throw new Error(
        `La preparacion controlada aun no esta implementada para ${strategy.label}.`,
      );
    }
    if (operation !== 'validate') {
      const existingResult = readRetryResult(
        retryResultPath,
        tipoDTE,
        confirmedFolio,
      );
      if (operation === 'send' && !existingResult) {
        assertNoUncertainAttempt(retryAttemptPath, tipoDTE, confirmedFolio);
      }
      if (operation === 'prepare') {
        assertConfirmedNotReceived(retryAttemptPath, tipoDTE, confirmedFolio);
      }
      app = await createFiscalTestApp();
    }
    trace.event('operation_started', 'Operacion iniciada en CERTIFICACION', {
      sourceArtifact: basename(sourceEnvelopePath),
    });
  });

  afterAll(async () => {
    if (app) await app.close();
    jest.restoreAllMocks();
  });

  it(`executes ${operation} without reserving another folio`, async () => {
    let retryResult =
      operation === 'send'
        ? readRetryResult(retryResultPath, tipoDTE, confirmedFolio)
        : undefined;
    const sourceArtifact = readSiiArtifact(sourceEnvelopePath);
    let candidate = sourceArtifact;
    if (operation === 'send' && strategy.prepare && !retryResult) {
      candidate = readPreparedArtifact(
        retryPreparationPath,
        sourceArtifact.buffer,
        tipoDTE,
        confirmedFolio,
      );
    }
    if (operation === 'validate') {
      candidate = readValidationCandidate(
        sourceArtifact,
        sourceEnvelopePath,
        retryPreparationPath,
        tipoDTE,
        confirmedFolio,
      );
    }
    const signedEnvelope = candidate.xml;
    const envelope = strategy.parseEnvelope(signedEnvelope);
    assertEnvelopeIdentity(envelope, signedEnvelope);
    trace.event('artifact_loaded', 'Artefacto de operacion cargado', {
      artifact: basename(candidate.path),
      bytes: candidate.buffer.length,
      sha256: sha256(candidate.buffer),
      signatureTimestamp: envelope.signatureTimestamp,
    });
    if (operation === 'send' && !retryResult) {
      strategy.prepare
        ? assertRetryEnvelopeTimestampIsFresh(envelope)
        : assertRetryEnvelopeTimestampIsNotFuture(envelope);
    }

    if (operation === 'validate') {
      const validation = validateArtifactOffline(
        signedEnvelope,
        candidate.path,
      );
      trace.event('validation_completed', 'Validacion offline completada', {
        artifact: basename(candidate.path),
        schema: validation.schema,
        tedSignature: 'valid',
        dteSignature: 'valid',
        envelopeSignature: 'valid',
        certificateFingerprint:
          validation.artifact.certificateFingerprintSha256,
      });
      return;
    }

    if (operation === 'send' && !retryResult) {
      assertNoUncertainAttempt(retryAttemptPath, tipoDTE, confirmedFolio);
    }

    const activeApp = requireApp(app);
    await restoreIssuerCertificate(activeApp);
    const contextResolver = activeApp.get(FiscalContextResolver);
    const tokenProvider = activeApp.get(FiscalTokenProvider);
    const signingProvider = activeApp.get(FISCAL_SIGNING_PROVIDER);
    const folioProvider = activeApp.get<{
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
      await folioProvider.getStatus(context, tipoDTE),
    );
    const certificate = await signingProvider.getSigningMaterial(context);
    trace.event('custody_loaded', 'Certificado cargado desde custodia', {
      certificateFingerprint: certificate.fingerprintSha256,
    });

    if (operation === 'prepare') {
      const sourceSchema = validateXmlAgainstOfficialSchema({
        xmlPath: sourceEnvelopePath,
        schemaZipPath: strategy.schema.zipPath,
        schemaName: strategy.schema.schemaName,
      });
      trace.event(
        'source_preflight_completed',
        'Fuente validada antes de firmar',
        {
          schema: sourceSchema.schemaName,
          sha256: sha256(sourceArtifact.buffer),
        },
      );
      const signatureTimestamp = formatSiiTimestamp();
      const prepared = strategy.prepare!({
        signedEnvelope: sourceArtifact.xml,
        certificate,
        signatureTimestamp,
      });
      const preparedPath = writePreparedArtifact(
        prepared.signedEnvelope,
        signatureTimestamp,
      );
      const preparedBuffer = readFileSync(preparedPath);
      const schema = validateXmlAgainstOfficialSchema({
        xmlPath: preparedPath,
        schemaZipPath: strategy.schema.zipPath,
        schemaName: strategy.schema.schemaName,
      });
      const preparation: RetryPreparation = {
        version: 1,
        tipoDTE,
        folio: confirmedFolio,
        state: 'prepared',
        preparedAt: new Date().toISOString(),
        signatureTimestamp,
        sourceArtifact: basename(sourceEnvelopePath),
        sourceSha256: sha256(sourceArtifact.buffer),
        artifactFile: basename(preparedPath),
        artifactSha256: sha256(preparedBuffer),
        validation: {
          schema: schema.schemaName,
          tedSignature: true,
          dteSignature: true,
          envelopeSignature: true,
        },
      };
      writeRetryPreparation(retryPreparationPath, preparation);
      trace.event('preparation_completed', 'Sobre regenerado sin upload', {
        artifact: preparation.artifactFile,
        bytes: preparedBuffer.length,
        sha256: preparation.artifactSha256,
        signatureTimestamp,
        schema: schema.schemaName,
        nextCommand: `retry send --type=${tipoDTE} --folio=${confirmedFolio}`,
      });
      await assertCustodyUnchanged(
        folioProvider,
        context,
        custodyBefore,
        getNextFolioSpy,
        reserveFolioSpy,
      );
      return;
    }

    if (operation === 'send' && !retryResult) {
      const schema = validateXmlAgainstOfficialSchema({
        xmlPath: candidate.path,
        schemaZipPath: strategy.schema.zipPath,
        schemaName: strategy.schema.schemaName,
      });
      const validation = validateRetryArtifact(candidate.xml, {
        tipoDTE,
        folio: confirmedFolio,
        certificatePem: certificate.certificatePem,
      });
      trace.event(
        'preflight_completed',
        'Preflight previo al upload completado',
        {
          artifact: basename(candidate.path),
          sha256: sha256(candidate.buffer),
          signatureTimestamp: validation.signatureTimestamp,
          schema: schema.schemaName,
          channel:
            strategy.authScope(environment) === 'dte'
              ? 'dte_maullin'
              : 'boleta_rest',
          transportProfile:
            strategy.authScope(environment) === 'dte'
              ? 'maullin_historical_v1'
              : 'boleta_rest_v1',
        },
      );
    }

    const token =
      strategy.authScope(environment) === 'boleta_rest'
        ? await tokenProvider.getBoletaToken(context, signingProvider)
        : await tokenProvider.getToken(context, signingProvider);

    if (operation === 'reconcile') {
      if (!strategy.queryDocumentStatus) {
        throw new Error(
          `La estrategia ${strategy.label} no permite reconciliar por documento.`,
        );
      }
      const dteStatus = await strategy.queryDocumentStatus({
        envelope,
        context,
        token: token.token,
        certificate,
      });
      const outcome = classifyReconciliationStatus(dteStatus.status);
      const checkedAt = new Date().toISOString();
      writeFileSync(
        retryReconciliationPath,
        JSON.stringify(
          {
            tipoDTE,
            folio: confirmedFolio,
            outcome,
            status: dteStatus.status,
            glosa: dteStatus.glosa,
            checkedAt,
          },
          null,
          2,
        ),
      );
      writeRetryAttempt(retryAttemptPath, {
        tipoDTE,
        folio: confirmedFolio,
        state:
          outcome === 'not_received'
            ? 'confirmed_not_received'
            : outcome === 'received'
              ? 'confirmed_received'
              : 'outcome_unknown',
        attemptedAt: checkedAt,
        error:
          outcome === 'unknown'
            ? {
                code: 'QUERY_FAILED',
                message: `Estado DTE no concluyente: ${dteStatus.status}`,
                detail: dteStatus.glosa,
              }
            : undefined,
      });
      await assertCustodyUnchanged(
        folioProvider,
        context,
        custodyBefore,
        getNextFolioSpy,
        reserveFolioSpy,
      );
      trace.event(
        'reconciliation_completed',
        `Reconciliacion ${outcome}: ${dteStatus.status}`,
        {
          outcome,
          status: dteStatus.status,
          glosa: dteStatus.glosa,
        },
      );
      if (outcome === 'unknown') {
        throw new Error(
          `El SII devolvio un estado no concluyente (${dteStatus.status}). No se habilita el reenvio.`,
        );
      }
      return;
    }

    if (!retryResult) {
      trace.event('upload_started', 'Iniciando unico upload permitido', {
        artifact: basename(candidate.path),
        sha256: sha256(candidate.buffer),
        channel:
          strategy.authScope(environment) === 'dte'
            ? 'dte_maullin'
            : 'boleta_rest',
        transportProfile:
          strategy.authScope(environment) === 'dte'
            ? 'maullin_historical_v1'
            : 'boleta_rest_v1',
      });
      writeRetryAttempt(retryAttemptPath, {
        tipoDTE,
        folio: confirmedFolio,
        state: 'sending',
        attemptedAt: new Date().toISOString(),
      });
      let sendResult;
      try {
        sendResult = await strategy.send({
          signedEnvelope,
          context,
          token: token.token,
          certificate,
        });
      } catch (error) {
        const sanitized = sanitizeSiiError(error, { includeDetail: true });
        writeRetryAttempt(retryAttemptPath, {
          tipoDTE,
          folio: confirmedFolio,
          state: 'outcome_unknown',
          attemptedAt: new Date().toISOString(),
          error: {
            code: sanitized.code,
            message: sanitized.message,
            detail: sanitized.detail,
          },
        });
        const rawResponse = isSiiError(error) ? error.rawResponse : undefined;
        if (rawResponse !== undefined)
          writeFileSync(retryErrorResponsePath, rawResponse);
        trace.event('upload_failed', 'Upload con resultado incierto', {
          errorCode: sanitized.code,
          errorMessage: sanitized.message,
          errorDetail: sanitized.detail,
          ...summarizeSiiResponse(rawResponse),
          nextCommand: `retry reconcile --type=${tipoDTE} --folio=${confirmedFolio}`,
        });
        throw new Error(
          `El upload de ${strategy.label} folio ${confirmedFolio} tuvo resultado incierto. No reintentar hasta confirmar su recepcion en el SII. Diagnostico protegido: ${retryAttemptPath}.`,
          { cause: error },
        );
      }
      if (!sendResult.trackId) {
        throw new Error('El SII no devolvio trackId para el retry.');
      }
      retryResult = {
        tipoDTE,
        folio: confirmedFolio,
        trackId: sendResult.trackId,
        sendStatus: sendResult.status,
        sentAt: new Date().toISOString(),
      };
      writeRetryResult(retryResultPath, retryResult);
      writeRetryAttempt(retryAttemptPath, {
        tipoDTE,
        folio: confirmedFolio,
        state: 'completed',
        attemptedAt: retryResult.sentAt,
        trackId: retryResult.trackId,
      });
      assertNormalSmokeSendStatus(
        sendResult.status,
        `Reenvio exacto de ${strategy.label} folio ${confirmedFolio}`,
        sendResult.detail,
      );
      trace.event('upload_succeeded', 'Upload aceptado con trackId', {
        trackId: retryResult.trackId,
        sendStatus: retryResult.sendStatus,
      });
    } else {
      trace.event('upload_skipped', 'TrackId persistido; no se repite upload', {
        trackId: retryResult.trackId,
      });
    }

    trace.event('polling_started', 'Consultando estado final del envio', {
      trackId: retryResult.trackId,
      timeoutMs: pollTimeoutMs,
      intervalMs: pollIntervalMs,
    });
    const finalStatus = await waitUntilFinal(
      retryResult.trackId,
      { context, token: token.token },
      strategy,
      {
        timeoutMs: pollTimeoutMs,
        intervalMs: pollIntervalMs,
        maxAttempts: 30,
        onAttempt: (result, attempt) => {
          trace.event('polling_attempt', 'Estado de envio consultado', {
            trackId: result.trackId,
            attempt: attempt + 1,
            status: result.normalizedStatus,
            terminal: result.isTerminal,
            accepted: result.statistics?.aceptados,
            rejected: result.statistics?.rechazados,
            repairs: result.statistics?.reparos,
          });
        },
      },
    );
    assertNormalSmokeSendStatus(
      finalStatus.normalizedStatus,
      `Estado del retry de ${strategy.label} folio ${confirmedFolio}`,
      finalStatus.detail,
      finalStatus.statistics,
    );
    trace.event('polling_completed', 'Polling de envio finalizado', {
      trackId: retryResult.trackId,
      status: finalStatus.normalizedStatus,
    });

    if (strategy.queryDocumentStatus) {
      const dteStatus = await strategy.queryDocumentStatus({
        envelope,
        context,
        token: token.token,
        certificate,
      });
      assertNormalSmokeDteStatus(
        dteStatus.status,
        `Estado DTE de ${strategy.label} folio ${confirmedFolio}`,
        dteStatus.glosa,
      );
      trace.event('document_status_completed', 'Estado DTE final consultado', {
        status: dteStatus.status,
        glosa: dteStatus.glosa,
      });
    }

    await assertCustodyUnchanged(
      folioProvider,
      context,
      custodyBefore,
      getNextFolioSpy,
      reserveFolioSpy,
    );
    trace.event('operation_completed', 'Retry completado sin mutar CAF');
  });

  function validateArtifactOffline(xml: string, path: string) {
    const schema = validateXmlAgainstOfficialSchema({
      xmlPath: path,
      schemaZipPath: strategy.schema.zipPath,
      schemaName: strategy.schema.schemaName,
    });
    const artifact = validateRetryArtifact(xml, {
      tipoDTE,
      folio: confirmedFolio,
    });
    return { schema: schema.schemaName, artifact };
  }

  function writePreparedArtifact(
    signedEnvelope: string,
    signatureTimestamp: string,
  ): string {
    const timestampId = signatureTimestamp.replace(/[-:]/g, '');
    const path = join(
      artifactDir,
      `prepared-envio-${tipoDTE}-${confirmedFolio}-${timestampId}.xml`,
    );
    writeFileSync(path, encodeSiiXml(signedEnvelope, strategy.label));
    return path;
  }

  async function assertCustodyUnchanged(
    folioProvider: {
      getStatus: (
        context: unknown,
        tipoDTE: TipoDTE,
      ) => Promise<CafWithStatus[]>;
    },
    context: unknown,
    before: unknown,
    getNextFolioSpy: jest.SpyInstance,
    reserveFolioSpy: jest.SpyInstance,
  ): Promise<void> {
    const after = summarizeCafState(
      await folioProvider.getStatus(context, tipoDTE),
    );
    expect(after).toEqual(before);
    expect(getNextFolioSpy).not.toHaveBeenCalled();
    expect(reserveFolioSpy).not.toHaveBeenCalled();
  }

  function assertEnvelopeIdentity(
    envelope: RetryEnvelopeData,
    signedEnvelope: string,
  ): void {
    expect(envelope.folio).toBe(confirmedFolio);
    expect(envelope.tipoDTE).toBe(tipoDTE);
    expect(normalizeRut(envelope.rutEmisor)).toBe(normalizeRut(rutEmisor));
    expect(signedEnvelope).toContain('<Signature');
  }

  async function restoreIssuerCertificate(
    activeApp: INestApplication,
  ): Promise<void> {
    if (!existsSync(pfxPath)) {
      throw new Error(`Falta el archivo PFX para el retry: ${pfxPath}.`);
    }
    if (!pfxPassword.trim()) {
      throw new Error(
        'Falta la password del PFX para el retry. Revisa el secret SII_PFX_PASSWORD_FILE.',
      );
    }
    if (!rutFirmante.trim()) {
      throw new Error('Falta REAL_SII_TEST_RUT_FIRMANTE para el retry.');
    }
    if (!fechaResolucion.trim()) {
      throw new Error('Falta REAL_SII_TEST_FECHA_RESOLUCION para el retry.');
    }
    if (!Number.isInteger(nroResolucion) || nroResolucion < 0) {
      throw new Error(
        `REAL_SII_TEST_NRO_RESOLUCION es invalido (${nroResolucionRaw || 'vacio'}).`,
      );
    }

    const custody = activeApp.get(FiscalCustodyService);
    await custody.upsertIssuerCertificate({
      tenantId,
      merchantId: optionalEnv('REAL_SII_TEST_MERCHANT_ID') || 'merchant-main',
      branchId: optionalEnv('REAL_SII_TEST_BRANCH_ID') || 'branch-001',
      environment,
      rutEmisor,
      fechaResolucion,
      nroResolucion,
      pfxBuffer: readFileSync(pfxPath),
      pfxPassword,
      rutFirmante,
    });
    trace.event(
      'certificate_rehydrated',
      'Certificado verificado y rehidratado en custodia',
    );
  }
});

interface RetryResult {
  tipoDTE: number;
  folio: number;
  trackId: string;
  sendStatus: string;
  sentAt: string;
}

interface RetryAttempt {
  tipoDTE: number;
  folio: number;
  state:
    | 'sending'
    | 'outcome_unknown'
    | 'confirmed_not_received'
    | 'confirmed_received'
    | 'completed';
  attemptedAt: string;
  trackId?: string;
  error?: {
    code: string;
    message: string;
    detail?: string;
  };
}

interface RetryPreparation {
  version: 1;
  tipoDTE: number;
  folio: number;
  state: 'prepared';
  preparedAt: string;
  signatureTimestamp: string;
  sourceArtifact: string;
  sourceSha256: string;
  artifactFile: string;
  artifactSha256: string;
  validation: {
    schema: string;
    tedSignature: true;
    dteSignature: true;
    envelopeSignature: true;
  };
}

interface SiiArtifact {
  path: string;
  buffer: Buffer;
  xml: string;
}

function readSiiArtifact(path: string): SiiArtifact {
  const buffer = readFileSync(path);
  return { path, buffer, xml: buffer.toString('latin1') };
}

function readValidationCandidate(
  source: SiiArtifact,
  sourcePath: string,
  preparationPath: string,
  expectedTipoDTE: number,
  expectedFolio: number,
): SiiArtifact {
  if (!existsSync(preparationPath)) return { ...source, path: sourcePath };
  return readPreparedArtifact(
    preparationPath,
    source.buffer,
    expectedTipoDTE,
    expectedFolio,
  );
}

function readPreparedArtifact(
  preparationPath: string,
  sourceBuffer: Buffer,
  expectedTipoDTE: number,
  expectedFolio: number,
): SiiArtifact {
  const preparation = readRetryPreparation(
    preparationPath,
    expectedTipoDTE,
    expectedFolio,
  );
  if (preparation.sourceSha256 !== sha256(sourceBuffer)) {
    throw new Error(
      'El artefacto fuente cambio despues de preparar la recuperacion.',
    );
  }
  if (basename(preparation.artifactFile) !== preparation.artifactFile) {
    throw new Error('El manifiesto de preparacion contiene una ruta insegura.');
  }
  const artifact = readSiiArtifact(
    join(dirname(preparationPath), preparation.artifactFile),
  );
  if (sha256(artifact.buffer) !== preparation.artifactSha256) {
    throw new Error(
      'El hash del artefacto preparado no coincide con el manifiesto.',
    );
  }
  return artifact;
}

function readRetryPreparation(
  path: string,
  expectedTipoDTE: number,
  expectedFolio: number,
): RetryPreparation {
  if (!existsSync(path)) {
    throw new Error(
      `No existe preparacion para DTE ${expectedTipoDTE}, folio ${expectedFolio}. Ejecute retry prepare antes de retry send.`,
    );
  }
  const parsed = JSON.parse(
    readFileSync(path, 'utf8'),
  ) as Partial<RetryPreparation>;
  if (
    parsed.version !== 1 ||
    parsed.state !== 'prepared' ||
    parsed.tipoDTE !== expectedTipoDTE ||
    parsed.folio !== expectedFolio ||
    typeof parsed.artifactFile !== 'string' ||
    typeof parsed.artifactSha256 !== 'string' ||
    typeof parsed.sourceSha256 !== 'string'
  ) {
    throw new Error(`El manifiesto de preparacion es invalido: ${path}`);
  }
  return parsed as RetryPreparation;
}

function writeRetryPreparation(path: string, value: RetryPreparation): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2));
}

function requireApp(app?: INestApplication): INestApplication {
  if (!app) throw new Error('La aplicacion de retry no fue inicializada.');
  return app;
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

function summarizeCafState(statuses: CafWithStatus[]): unknown {
  return statuses.map((entry) => ({
    tipoDTE: entry.caf.da.tipoDTE,
    rangeStart: entry.caf.da.rangeStart,
    rangeEnd: entry.caf.da.rangeEnd,
    status: entry.status,
    remaining: entry.remaining,
  }));
}

function readRetryResult(
  path: string,
  expectedTipoDTE: number,
  expectedFolio: number,
): RetryResult | undefined {
  if (!existsSync(path)) return undefined;
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<RetryResult>;
  if (
    parsed.tipoDTE !== expectedTipoDTE ||
    parsed.folio !== expectedFolio ||
    typeof parsed.trackId !== 'string' ||
    !parsed.trackId
  ) {
    throw new Error(`El resultado de retry existente es invalido: ${path}`);
  }
  return parsed as RetryResult;
}

function writeRetryResult(path: string, result: RetryResult): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(result, null, 2));
}

function assertNoUncertainAttempt(
  path: string,
  expectedTipoDTE: number,
  expectedFolio: number,
): void {
  if (!existsSync(path)) return;
  const attempt = JSON.parse(readFileSync(path, 'utf8')) as RetryAttempt;
  if (attempt.tipoDTE !== expectedTipoDTE || attempt.folio !== expectedFolio) {
    throw new Error(`El marcador de retry existente es invalido: ${path}`);
  }
  if (attempt.state === 'confirmed_not_received') return;
  throw new Error(
    attempt.state === 'completed'
      ? `El marcador indica upload completado para DTE ${expectedTipoDTE}, folio ${expectedFolio}, pero falta retry-result.json. No se reenviara.`
      : `Existe un upload previo con resultado incierto para DTE ${expectedTipoDTE}, folio ${expectedFolio}. No se reenviara. Revisa ${path} y confirma el estado en el SII.`,
  );
}

function assertConfirmedNotReceived(
  path: string,
  expectedTipoDTE: number,
  expectedFolio: number,
): void {
  if (!existsSync(path)) {
    throw new Error(
      `Falta reconciliacion para DTE ${expectedTipoDTE}, folio ${expectedFolio}. Ejecute retry reconcile antes de retry prepare.`,
    );
  }
  const attempt = JSON.parse(readFileSync(path, 'utf8')) as RetryAttempt;
  if (
    attempt.tipoDTE !== expectedTipoDTE ||
    attempt.folio !== expectedFolio ||
    attempt.state !== 'confirmed_not_received'
  ) {
    throw new Error(
      `retry prepare requiere confirmed_not_received para DTE ${expectedTipoDTE}, folio ${expectedFolio}.`,
    );
  }
}

function writeRetryAttempt(path: string, attempt: RetryAttempt): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(attempt, null, 2));
}

type RetryOperation = 'validate' | 'prepare' | 'reconcile' | 'send';

function parseRetryOperation(value?: string): RetryOperation {
  if (
    value === 'validate' ||
    value === 'prepare' ||
    value === 'reconcile' ||
    value === 'send'
  ) {
    return value;
  }
  throw new Error(
    `REAL_SII_TEST_RETRY_OPERATION debe ser validate, prepare, reconcile o send; valor: ${value || 'vacio'}.`,
  );
}

function classifyReconciliationStatus(
  status: DteStatus,
): 'received' | 'not_received' | 'unknown' {
  if (status === 'FAU') return 'not_received';
  if (
    ['DOK', 'DNK', 'FAN', 'TMD', 'TMC', 'MMD', 'NNC', 'AND', 'ANC'].includes(
      status,
    )
  ) {
    return 'received';
  }
  return 'unknown';
}

function parseBoundedInteger(
  raw: string,
  name: string,
  minimum: number,
  maximum: number,
): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} debe estar entre ${minimum} y ${maximum}.`);
  }
  return value;
}
