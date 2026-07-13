import {
  BoletaSiiClient,
  DteSiiClient,
  formatSiiTimestamp,
  resolveBoletaAuthScope,
  SiiEnvironment,
  TipoDTE,
  type CertificateMaterial,
  type DteStatusQueryResult,
  type IssuerContext,
  type SendResult,
  type SendStatusClient,
  type StatusQueryResult,
  type BoletaAuthScope,
} from 'sii-engine';
import {
  prepareBoletaRetryEnvelope,
  type PreparedRetryEnvelope,
} from './sii-retry-artifact';

export interface RetryEnvelopeData {
  folio: number;
  tipoDTE: TipoDTE;
  rutEmisor: string;
  fechaEmision?: string;
  montoTotal?: number;
  rutReceptor?: string;
  signatureTimestamp?: string;
}

export interface RetrySendInput {
  signedEnvelope: string;
  context: IssuerContext;
  token: string;
  certificate: CertificateMaterial;
}

export interface RetryDocumentStatusInput {
  envelope: RetryEnvelopeData;
  context: IssuerContext;
  token: string;
  certificate: CertificateMaterial;
}

export interface SiiRetryStrategy extends SendStatusClient {
  readonly tipoDTE: TipoDTE.FacturaElectronica | TipoDTE.BoletaElectronica;
  readonly label: string;
  readonly schema: {
    zipPath: string;
    schemaName: string;
  };
  authScope(environment: SiiEnvironment): BoletaAuthScope;
  artifactPath(folio: number): string;
  parseEnvelope(xml: string): RetryEnvelopeData;
  send(input: RetrySendInput): Promise<SendResult>;
  prepare?(input: {
    signedEnvelope: string;
    certificate: CertificateMaterial;
    signatureTimestamp: string;
  }): PreparedRetryEnvelope;
  queryDocumentStatus?(
    input: RetryDocumentStatusInput,
  ): Promise<DteStatusQueryResult>;
}

export function createSiiRetryStrategy(tipoDTE: number): SiiRetryStrategy {
  if (tipoDTE === TipoDTE.FacturaElectronica) {
    return new Factura33RetryStrategy();
  }
  if (tipoDTE === TipoDTE.BoletaElectronica) {
    return new Boleta39RetryStrategy();
  }
  throw new Error(`No existe estrategia de retry para DTE ${tipoDTE}.`);
}

export function assertRetryEnvelopeTimestampIsNotFuture(
  envelope: RetryEnvelopeData,
  now = new Date(),
): void {
  if (!envelope.signatureTimestamp) {
    throw new Error(
      'El sobre no contiene TmstFirmaEnv para validar su vigencia.',
    );
  }
  const nowInChile = formatSiiTimestamp(now);
  if (envelope.signatureTimestamp > nowInChile) {
    throw new Error(
      `El sobre fue firmado con timestamp futuro para Chile (${envelope.signatureTimestamp}; ahora ${nowInChile}). No se realizara upload. Debe regenerarse y firmarse con hora America/Santiago.`,
    );
  }
}

export function assertRetryEnvelopeTimestampIsFresh(
  envelope: RetryEnvelopeData,
  now = new Date(),
  maxAgeMs = 15 * 60 * 1000,
): void {
  assertRetryEnvelopeTimestampIsNotFuture(envelope, now);
  const oldestAccepted = formatSiiTimestamp(
    new Date(now.getTime() - maxAgeMs),
  );
  if (envelope.signatureTimestamp! < oldestAccepted) {
    throw new Error(
      `El sobre preparado expiro (${envelope.signatureTimestamp}; antiguedad maxima ${Math.round(maxAgeMs / 60000)} minutos). Ejecute retry prepare nuevamente antes del upload.`,
    );
  }
}

class Factura33RetryStrategy implements SiiRetryStrategy {
  readonly tipoDTE = TipoDTE.FacturaElectronica;
  readonly label = 'factura 33';
  readonly schema = {
    zipPath: 'docs_sii/FormatoXML/schema_dte.zip',
    schemaName: 'EnvioDTE_v10.xsd',
  };
  authScope(): BoletaAuthScope {
    return 'dte';
  }
  private readonly client = new DteSiiClient();

  artifactPath(folio: number): string {
    return `secure/real-sii-tests/artifacts/factura33/${folio}/signed-envio-dte-attempt.xml`;
  }

  parseEnvelope(xml: string): RetryEnvelopeData {
    assertEnvelopeRoot(xml, 'EnvioDTE', this.label);
    return parseQueryableEnvelope(xml);
  }

  send(input: RetrySendInput): Promise<SendResult> {
    return this.client.send(
      input.signedEnvelope,
      input.context,
      input.token,
      input.certificate.rutFirmante,
    );
  }

  queryStatus(
    trackId: string,
    context: IssuerContext,
    token: string,
  ): Promise<StatusQueryResult> {
    return this.client.queryStatus(trackId, context, token);
  }

  queryDocumentStatus(
    input: RetryDocumentStatusInput,
  ): Promise<DteStatusQueryResult> {
    return queryDocumentStatus(this.client, input);
  }
}

class Boleta39RetryStrategy implements SiiRetryStrategy {
  readonly tipoDTE = TipoDTE.BoletaElectronica;
  readonly label = 'boleta 39';
  readonly schema = {
    zipPath: 'docs_sii/FormatoXML/schema_envio_bol.zip',
    schemaName: 'EnvioBOLETA_v11.xsd',
  };
  authScope(environment: SiiEnvironment): BoletaAuthScope {
    return resolveBoletaAuthScope(environment);
  }
  private readonly client = new BoletaSiiClient();

  artifactPath(folio: number): string {
    return `secure/real-sii-tests/artifacts/${folio}/signed-envio-boleta-attempt.xml`;
  }

  parseEnvelope(xml: string): RetryEnvelopeData {
    assertEnvelopeRoot(xml, 'EnvioBOLETA', this.label);
    return parseQueryableEnvelope(xml);
  }

  send(input: RetrySendInput): Promise<SendResult> {
    return this.client.send(
      input.signedEnvelope,
      input.context,
      input.token,
      input.certificate.rutFirmante,
    );
  }

  prepare(input: {
    signedEnvelope: string;
    certificate: CertificateMaterial;
    signatureTimestamp: string;
  }): PreparedRetryEnvelope {
    return prepareBoletaRetryEnvelope({
      sourceEnvelope: input.signedEnvelope,
      certificate: input.certificate,
      tipoDTE: this.tipoDTE,
      folio: parseCommonEnvelope(input.signedEnvelope).folio,
      signatureTimestamp: input.signatureTimestamp,
    });
  }

  queryStatus(
    trackId: string,
    context: IssuerContext,
    token: string,
  ): Promise<StatusQueryResult> {
    return this.client.queryStatus(trackId, context, token);
  }

  queryDocumentStatus(
    input: RetryDocumentStatusInput,
  ): Promise<DteStatusQueryResult> {
    return this.client.queryDocumentStatus({
      tipoDTE: input.envelope.tipoDTE,
      folio: input.envelope.folio,
      fechaEmision: input.envelope.fechaEmision,
      montoTotal: input.envelope.montoTotal,
      rutReceptor: input.envelope.rutReceptor,
      rutConsultante: input.certificate.rutFirmante,
      context: input.context,
      token: input.token,
    });
  }
}

function parseQueryableEnvelope(xml: string): RetryEnvelopeData {
  const envelope = parseCommonEnvelope(xml);
  const fechaEmision = requiredXmlValue(xml, 'FchEmis');
  const montoTotal = Number(requiredXmlValue(xml, 'MntTotal'));
  const rutReceptor = requiredXmlValue(xml, 'RUTRecep');
  const signatureTimestamp = requiredXmlValue(xml, 'TmstFirmaEnv');
  if (!Number.isInteger(montoTotal) || montoTotal <= 0) {
    throw new Error('El sobre de retry no contiene MntTotal valido.');
  }
  return {
    ...envelope,
    fechaEmision,
    montoTotal,
    rutReceptor,
    signatureTimestamp,
  };
}

function queryDocumentStatus(
  client: DteSiiClient,
  input: RetryDocumentStatusInput,
): Promise<DteStatusQueryResult> {
  const { envelope, certificate } = input;
  if (!envelope.fechaEmision || !envelope.montoTotal || !envelope.rutReceptor) {
    throw new Error('Faltan datos para consultar estado DTE.');
  }
  const signer = splitRut(certificate.rutFirmante);
  const receiver = splitRut(envelope.rutReceptor);
  return client.queryDteStatus(
    {
      rutConsultante: signer.body,
      dvConsultante: signer.dv,
      tipoDTE: envelope.tipoDTE,
      folio: envelope.folio,
      fechaEmision: envelope.fechaEmision,
      montoTotal: envelope.montoTotal,
      rutReceptor: receiver.body,
      dvReceptor: receiver.dv,
      token: input.token,
    },
    input.context,
    input.token,
  );
}

function parseCommonEnvelope(xml: string): RetryEnvelopeData {
  const folio = Number(requiredXmlValue(xml, 'Folio'));
  const tipoDTE = Number(requiredXmlValue(xml, 'TipoDTE')) as TipoDTE;
  if (!Number.isInteger(folio) || folio <= 0) {
    throw new Error('El sobre de retry no contiene un folio valido.');
  }
  return {
    folio,
    tipoDTE,
    rutEmisor: requiredXmlValue(xml, 'RUTEmisor'),
  };
}

function assertEnvelopeRoot(xml: string, root: string, label: string): void {
  if (!new RegExp(`<${root}\\b`, 'i').test(xml)) {
    throw new Error(`El artefacto de ${label} no contiene ${root}.`);
  }
}

function requiredXmlValue(xml: string, tag: string): string {
  const value = xml
    .match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i'))?.[1]
    ?.trim();
  if (!value) throw new Error(`Falta ${tag} en el sobre de retry.`);
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
