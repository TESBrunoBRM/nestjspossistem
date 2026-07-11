import {
  DTE_STATES,
  SEND_STATES,
  type DteStatus,
  type SendStatus,
} from 'sii-engine';

const ACCEPTABLE_DTE_STATUSES = new Set<DteStatus>(['DOK', 'AND', 'ANC']);

export function assertNormalSmokeSendStatus(
  status: string,
  stage: string,
  detail?: string,
  statistics?: { rechazados?: number; reparos?: number },
): asserts status is SendStatus {
  const normalized = status.trim().toUpperCase() as SendStatus;
  const info = SEND_STATES[normalized];

  if (
    !info ||
    normalized === 'UNKNOWN' ||
    info.isError ||
    info.requiresRemediation
  ) {
    throw new Error(
      `${stage} devolvio un estado SII no aceptable para un smoke normal: ${status || 'vacio'}.${formatDetail(detail)}`,
    );
  }

  if (
    Number(statistics?.rechazados ?? 0) > 0 ||
    Number(statistics?.reparos ?? 0) > 0
  ) {
    throw new Error(
      `${stage} devolvio documentos rechazados o con reparos: rechazados=${Number(
        statistics?.rechazados ?? 0,
      )}, reparos=${Number(statistics?.reparos ?? 0)}.${formatDetail(detail)}`,
    );
  }
}

export function assertNormalSmokeDteStatus(
  status: string,
  stage: string,
  detail?: string,
): asserts status is DteStatus {
  const normalized = status.trim().toUpperCase() as DteStatus;
  const info = DTE_STATES[normalized];

  if (
    !info ||
    normalized === 'UNKNOWN' ||
    info.isError ||
    info.requiresRemediation ||
    !ACCEPTABLE_DTE_STATUSES.has(normalized)
  ) {
    throw new Error(
      `${stage} devolvio un estado DTE no aceptable o inconcluso: ${status || 'vacio'}.${formatDetail(detail)}`,
    );
  }
}

export function assertExpectedSendStatus(
  actual: string,
  expected: SendStatus,
  stage: string,
): void {
  if (actual.trim().toUpperCase() !== expected) {
    throw new Error(
      `${stage} esperaba explicitamente ${expected} y recibio ${actual || 'vacio'}.`,
    );
  }
}

function formatDetail(detail?: string): string {
  return detail?.trim() ? ` Detalle: ${detail.trim()}` : '';
}
