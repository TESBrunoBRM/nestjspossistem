import type { CafMaterial, CafWithStatus, FolioAssignment } from "./types/caf.types.js";
import { TipoDTE, type DteDocument } from "./types/dte.types.js";
import type {
  DteStatusQueryResult,
  SendResult,
  StatusQueryResult,
} from "./types/transport.types.js";
import type { IssuerContext } from "./types/context.types.js";
import { parseSendStatus } from "./states/index.js";
import { isSiiError } from "./errors/index.js";

export function normalizeRut(rut: string): string {
  const cleaned = String(rut ?? "")
    .replace(/\./g, "")
    .replace(/\s/g, "")
    .toUpperCase();
  if (!cleaned) return "";
  if (cleaned.includes("-")) {
    const [body, dv] = cleaned.split("-");
    return `${body}-${dv}`;
  }
  return `${cleaned.slice(0, -1)}-${cleaned.slice(-1)}`;
}

export function splitRut(rut: string): { rut: string; body: string; dv: string } {
  const normalized = normalizeRut(rut);
  const [body, dv] = normalized.split("-");
  return { rut: body, body, dv };
}

export function isBoletaTipoDTE(tipoDTE: number): boolean {
  return (
    Number(tipoDTE) === TipoDTE.BoletaElectronica ||
    Number(tipoDTE) === TipoDTE.BoletaNoAfectaExentaElectronica
  );
}

export function toPublicSendResult(result: SendResult): Record<string, unknown> {
  return compact({
    trackId: result.trackId,
    status: result.status,
    detail: result.detail,
  });
}

export interface PublicPollingResult {
  trackId: string;
  status: string;
  normalizedStatus: string;
  nextPollAfter: number;
  detail?: string;
  estadisticas?: StatusQueryResult["estadisticas"];
  rawResponse?: string;
}

export async function pollOnce(
  trackId: string,
  auth: { context: IssuerContext; token: string },
  client: {
    queryStatus(
      trackId: string,
      context: IssuerContext,
      token: string
    ): Promise<StatusQueryResult>;
  },
  attempt = 0
): Promise<PublicPollingResult> {
  const result = await client.queryStatus(trackId, auth.context, auth.token);
  return {
    trackId,
    status: result.status,
    normalizedStatus: parseSendStatus(result.status),
    nextPollAfter: getNextPollAfter(attempt),
    detail: result.detail,
    estadisticas: result.estadisticas,
    rawResponse: result.rawResponse,
  };
}

export async function waitUntilFinal(
  trackId: string,
  auth: { context: IssuerContext; token: string },
  client: {
    queryStatus(
      trackId: string,
      context: IssuerContext,
      token: string
    ): Promise<StatusQueryResult>;
  },
  options: { maxAttempts?: number } = {}
): Promise<PublicPollingResult> {
  const maxAttempts = options.maxAttempts ?? 5;
  let last: PublicPollingResult | undefined;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    last = await pollOnce(trackId, auth, client, attempt);
    if (!["EPR", "CRT", "UNKNOWN"].includes(last.normalizedStatus)) return last;
  }
  return last!;
}

export function getNextPollAfter(attempt = 0): number {
  return Math.min(15 * 60 * 1000, Math.max(60 * 1000, (attempt + 1) * 60 * 1000));
}

export function toPublicPollingResult(result: PublicPollingResult): Record<string, unknown> {
  return compact({
    trackId: result.trackId,
    status: result.status,
    normalizedStatus: result.normalizedStatus,
    nextPollAfter: result.nextPollAfter,
    detail: result.detail,
    estadisticas: result.estadisticas,
  });
}

export function toPublicDteStatusQueryResult(
  result: DteStatusQueryResult
): Record<string, unknown> {
  return compact({
    tipoDTE: result.tipoDTE,
    folio: result.folio,
    rutEmisor: result.rutEmisor,
    status: result.status,
    glosa: result.glosa,
  });
}

export function toPublicCafMetadata(caf: CafMaterial): Record<string, unknown> {
  return {
    rutEmisor: caf.da.rutEmisor,
    razonSocial: caf.da.razonSocial,
    tipoDTE: caf.da.tipoDTE,
    rangeStart: caf.da.rangeStart,
    rangeEnd: caf.da.rangeEnd,
    fechaAutorizacion: caf.da.fechaAutorizacion,
    idk: caf.da.idk,
  };
}

export function toPublicCafStatus(status: CafWithStatus): Record<string, unknown> {
  return {
    status: status.status,
    remaining: status.remaining,
    caf: toPublicCafMetadata(status.caf as CafMaterial),
  };
}

export function toPublicFolioAssignment(
  assignment: FolioAssignment
): Record<string, unknown> {
  return {
    folio: assignment.folio,
    assignedAt: assignment.assignedAt,
    caf: toPublicCafMetadata(assignment.caf),
  };
}

export interface CafAcquisitionRequest {
  context: IssuerContext;
  tipoDTE: TipoDTE;
  quantity: number;
  method?: string;
  idempotencyKey?: string;
}

export interface CafAcquisitionResult {
  requestId: string;
  status: "manual_action_required" | "downloaded" | "imported" | "failed" | string;
  method: string;
  context: IssuerContext;
  tipoDTE: TipoDTE;
  quantityRequested: number;
  requestedAt: Date;
  completedAt?: Date;
  detail?: string;
  retryable?: boolean;
  caf?: CafMaterial;
  rawResponse?: string;
}

export interface CafAcquisitionProvider {
  requestCaf(request: CafAcquisitionRequest): Promise<CafAcquisitionResult>;
}

export function validateCafAcquisitionRequest(
  request: CafAcquisitionRequest,
  options: { allowedTipoDTE?: readonly TipoDTE[]; maxQuantity?: number } = {}
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!request.context?.rutEmisor) issues.push("context.rutEmisor requerido");
  if (!request.context?.environment) issues.push("context.environment requerido");
  if (!Number.isInteger(Number(request.tipoDTE))) issues.push("tipoDTE requerido");
  if (!Number.isInteger(Number(request.quantity)) || Number(request.quantity) <= 0) {
    issues.push("quantity debe ser positivo");
  }
  if (options.maxQuantity && request.quantity > options.maxQuantity) {
    issues.push(`quantity no puede exceder ${options.maxQuantity}`);
  }
  if (options.allowedTipoDTE && !options.allowedTipoDTE.includes(request.tipoDTE)) {
    issues.push("tipoDTE no permitido");
  }
  return { valid: issues.length === 0, issues };
}

export function assertCafAcquisitionRequest(
  request: CafAcquisitionRequest,
  options: { allowedTipoDTE?: readonly TipoDTE[]; maxQuantity?: number } = {}
): void {
  const validation = validateCafAcquisitionRequest(request, options);
  if (!validation.valid) {
    throw new Error(validation.issues.join("; "));
  }
}

export function toPublicCafAcquisitionResult(
  result: CafAcquisitionResult
): Record<string, unknown> {
  return compact({
    requestId: result.requestId,
    status: result.status,
    method: result.method,
    rutEmisor: result.context.rutEmisor,
    environment: result.context.environment,
    tipoDTE: result.tipoDTE,
    quantityRequested: result.quantityRequested,
    requestedAt: result.requestedAt,
    completedAt: result.completedAt,
    detail: result.detail,
    retryable: result.retryable,
    caf: result.caf ? toPublicCafMetadata(result.caf) : undefined,
  });
}

export function validateEdgeFiscalProvision(provision: Record<string, unknown>): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  const folioStart = Number(provision.folioStart);
  const folioEnd = Number(provision.folioEnd);
  if (!provision.rutEmisor) issues.push("rutEmisor requerido");
  if (!Number.isInteger(Number(provision.tipoDTE))) issues.push("tipoDTE requerido");
  if (!Number.isInteger(folioStart) || folioStart <= 0) issues.push("folioStart invalido");
  if (!Number.isInteger(folioEnd) || folioEnd < folioStart) issues.push("folioEnd invalido");
  if (provision.expiresAt && Number.isNaN(Date.parse(String(provision.expiresAt)))) {
    issues.push("expiresAt invalido");
  }
  return { valid: issues.length === 0, issues };
}

export function toPublicEdgeFiscalProvision(
  provision: Record<string, unknown>
): Record<string, unknown> {
  return { ...provision };
}

export function buildPrintedSampleArtifact(
  document: DteDocument,
  tedXml: string
): Record<string, unknown> {
  return {
    tipoDTE: document.idDoc.tipoDTE,
    folio: document.idDoc.folio,
    rutEmisor: document.emisor.rutEmisor,
    rutReceptor: document.receptor?.rutRecep,
    montoTotal: document.totales.mntTotal,
    tedXml,
    pdf417Payload: tedXml,
  };
}

export interface PublicSiiError {
  code: string;
  message: string;
  details?: string;
}

export function toPublicSiiError(error: unknown): PublicSiiError {
  if (isSiiError(error)) {
    const publicError: PublicSiiError = {
      code: error.code,
      message: sanitizeMessage(error.message),
    };
    if (error.detail) {
      publicError.details = sanitizeMessage(error.detail);
    }
    return publicError;
  }
  if (error instanceof Error) {
    return {
      code: "ERROR",
      message: sanitizeMessage(error.message),
    };
  }
  return { code: "UNKNOWN", message: "Error desconocido" };
}

export const sanitizeSiiError = toPublicSiiError;

function sanitizeMessage(value: string): string {
  return value
    .replace(/<AUTORIZACION\b[\s\S]*?<\/AUTORIZACION>/gi, "[REDACTED]")
    .replace(/<CAF\b[\s\S]*?<\/CAF>/gi, "[REDACTED]")
    .replace(/<[^>]*>/g, "[XML REDACTED]")
    .replace(/\b(cookie|token|password|passphrase|privateKey|RSASK)\b\s*[:=]\s*[^;<\s]+/gi, "[REDACTED]");
}

function compact(object: object): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(object).filter(([, value]) => value !== undefined)
  );
}
