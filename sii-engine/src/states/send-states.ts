import type { SendStatus } from "../types/transport.types.js";

export interface SendStatusInfo {
  code: SendStatus;
  label: string;
  description: string;
  isTerminal: boolean;
  isError: boolean;
  requiresRemediation: boolean;
}

export const SEND_STATES: Record<SendStatus, SendStatusInfo> = {
  RSC: {
    code: "RSC",
    label: "Rechazado — Error de Schema",
    description: "El sobre fue rechazado por errores de validación de schema XML.",
    isTerminal: true,
    isError: true,
    requiresRemediation: true,
  },
  SOK: {
    code: "SOK",
    label: "Recibido OK",
    description: "El sobre fue recibido y aceptado por el SII.",
    isTerminal: false,
    isError: false,
    requiresRemediation: false,
  },
  CRT: {
    code: "CRT",
    label: "En Curso",
    description: "El sobre está siendo procesado por el SII.",
    isTerminal: false,
    isError: false,
    requiresRemediation: false,
  },
  RCT: {
    code: "RCT",
    label: "Rechazado — Error de Contenido",
    description: "El sobre fue rechazado por errores en el contenido de los DTEs.",
    isTerminal: true,
    isError: true,
    requiresRemediation: true,
  },
  RCH: {
    code: "RCH",
    label: "Rechazado",
    description: "El envío fue rechazado por el SII.",
    isTerminal: true,
    isError: true,
    requiresRemediation: true,
  },
  EPR: {
    code: "EPR",
    label: "Enviado — En Proceso",
    description: "El sobre fue enviado al SII y está en proceso de revisión.",
    isTerminal: false,
    isError: false,
    requiresRemediation: false,
  },
  RFR: {
    code: "RFR",
    label: "Rechazado — Folio Repetido",
    description: "El sobre fue rechazado porque contiene folios ya utilizados.",
    isTerminal: true,
    isError: true,
    requiresRemediation: true,
  },
  PRD: {
    code: "PRD",
    label: "Procesado Definitivo",
    description: "El sobre fue procesado definitivamente por el SII.",
    isTerminal: true,
    isError: false,
    requiresRemediation: false,
  },
  UNKNOWN: {
    code: "UNKNOWN",
    label: "Estado Desconocido",
    description: "El estado no fue reconocido.",
    isTerminal: false,
    isError: false,
    requiresRemediation: false,
  },
};

export function parseSendStatus(raw: string): SendStatus {
  const normalized = raw.trim().toUpperCase();
  const known: SendStatus[] = ["RSC", "SOK", "CRT", "RCT", "RCH", "EPR", "RFR", "PRD"];
  if (known.includes(normalized as SendStatus)) {
    return normalized as SendStatus;
  }
  return "UNKNOWN";
}

export function isSendStatusTerminal(status: SendStatus): boolean {
  return SEND_STATES[status].isTerminal;
}

export function requiresRemediation(status: SendStatus): boolean {
  return SEND_STATES[status].requiresRemediation;
}
