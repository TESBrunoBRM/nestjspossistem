import type { DteStatus, DteAcceptanceStatus } from "../types/transport.types.js";

export interface DteStatusInfo {
  code: DteStatus;
  label: string;
  description: string;
  isTerminal: boolean;
  isError: boolean;
  requiresRemediation: boolean;
}

export const DTE_STATES: Record<DteStatus, DteStatusInfo> = {
  DOK: {
    code: "DOK",
    label: "Documento Recibido OK",
    description: "El documento fue recibido y los datos coinciden correctamente.",
    isTerminal: false,
    isError: false,
    requiresRemediation: false,
  },
  DNK: {
    code: "DNK",
    label: "Documento No Reconocido",
    description: "El documento no fue reconocido — los datos no coinciden.",
    isTerminal: true,
    isError: true,
    requiresRemediation: true,
  },
  FAU: {
    code: "FAU",
    label: "Firma Autenticada",
    description: "El documento tiene firma válida y autenticada.",
    isTerminal: false,
    isError: false,
    requiresRemediation: false,
  },
  FNA: {
    code: "FNA",
    label: "Firma No Autenticada",
    description: "El documento no tiene firma válida.",
    isTerminal: true,
    isError: true,
    requiresRemediation: true,
  },
  FAN: {
    code: "FAN",
    label: "Firma Anulada",
    description: "La firma del documento ha sido anulada.",
    isTerminal: true,
    isError: true,
    requiresRemediation: true,
  },
  EMP: {
    code: "EMP",
    label: "En Proceso",
    description: "El documento está siendo procesado por el SII.",
    isTerminal: false,
    isError: false,
    requiresRemediation: false,
  },
  TMD: {
    code: "TMD",
    label: "Timeout de Documento",
    description: "El documento no recibió respuesta en tiempo.",
    isTerminal: false,
    isError: false,
    requiresRemediation: false,
  },
  TMC: {
    code: "TMC",
    label: "Timeout de Consulta",
    description: "La consulta de estado no respondió en tiempo.",
    isTerminal: false,
    isError: false,
    requiresRemediation: false,
  },
  MMD: {
    code: "MMD",
    label: "Monto Mal Declarado",
    description: "El monto del documento no coincide con lo declarado.",
    isTerminal: true,
    isError: true,
    requiresRemediation: true,
  },
  NNC: {
    code: "NNC",
    label: "Número No Correlativo",
    description: "El folio del documento no es correlativo.",
    isTerminal: true,
    isError: true,
    requiresRemediation: true,
  },
  AND: {
    code: "AND",
    label: "Aceptado con Nota de Débito",
    description: "El documento fue aceptado con una nota de débito asociada.",
    isTerminal: true,
    isError: false,
    requiresRemediation: false,
  },
  ANC: {
    code: "ANC",
    label: "Aceptado con Nota de Crédito",
    description: "El documento fue aceptado con una nota de crédito asociada.",
    isTerminal: true,
    isError: false,
    requiresRemediation: false,
  },
  UNKNOWN: {
    code: "UNKNOWN",
    label: "Estado Desconocido",
    description: "El estado del documento no fue reconocido.",
    isTerminal: false,
    isError: false,
    requiresRemediation: false,
  },
};

export function parseDteStatus(raw: string): DteStatus {
  const normalized = raw.trim().toUpperCase();
  const known: DteStatus[] = [
    "DOK", "DNK", "FAU", "FNA", "FAN", "EMP",
    "TMD", "TMC", "MMD", "NNC", "AND", "ANC",
  ];
  if (known.includes(normalized as DteStatus)) {
    return normalized as DteStatus;
  }
  return "UNKNOWN";
}

export function parseDteAcceptanceStatus(raw: string): DteAcceptanceStatus {
  const normalized = raw.trim().toUpperCase();
  const known: DteAcceptanceStatus[] = ["ACD", "RCD", "ERM", "ACS"];
  if (known.includes(normalized as DteAcceptanceStatus)) {
    return normalized as DteAcceptanceStatus;
  }
  return "PENDING";
}

export type DteLifecycleState =
  | "pending_send"
  | "sent"
  | "processing"
  | "accepted"
  | "accepted_with_remarks"
  | "rejected"
  | "remediation_required";

export function toLifecycleState(
  sendStatus: import("../types/transport.types.js").SendStatus,
  dteStatus?: DteStatus
): DteLifecycleState {
  if (sendStatus === "RSC" || sendStatus === "RCT" || sendStatus === "RFR") {
    return "rejected";
  }
  if (sendStatus === "PRD") {
    if (!dteStatus || dteStatus === "DOK" || dteStatus === "FAU") return "accepted";
    if (dteStatus === "AND" || dteStatus === "ANC") return "accepted_with_remarks";
    if (dteStatus === "DNK" || dteStatus === "FNA" || dteStatus === "FAN" || dteStatus === "MMD" || dteStatus === "NNC") return "remediation_required";
  }
  if (sendStatus === "SOK" || sendStatus === "EPR" || sendStatus === "CRT") {
    return "processing";
  }
  return "sent";
}
