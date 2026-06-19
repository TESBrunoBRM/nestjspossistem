export enum SiiEnvironment {
  Certificacion = "CERTIFICACION",
  Produccion = "PRODUCCION",
}

export type SendStatus =
  | "RSC"
  | "SOK"
  | "CRT"
  | "RCT"
  | "RCH"
  | "EPR"
  | "RFR"
  | "PRD"
  | "UNKNOWN";

export const SEND_STATUS_DESCRIPTION: Record<SendStatus, string> = {
  RSC: "Rechazado — sobre con errores de schema",
  SOK: "Recibido OK — sobre aceptado",
  CRT: "En curso — procesando documentos",
  RCT: "Rechazado — error de contenido",
  RCH: "Rechazado",
  EPR: "Enviado al SII — en proceso",
  RFR: "Rechazado — folio ya utilizado",
  PRD: "Producción — procesado definitivo",
  UNKNOWN: "Estado desconocido",
};

export type DteStatus =
  | "DOK"
  | "DNK"
  | "FAU"
  | "FNA"
  | "FAN"
  | "EMP"
  | "TMD"
  | "TMC"
  | "MMD"
  | "NNC"
  | "AND"
  | "ANC"
  | "UNKNOWN";

export const DTE_STATUS_DESCRIPTION: Record<DteStatus, string> = {
  DOK: "Documento recibido OK — datos correctos",
  DNK: "Documento no recibido — datos no coinciden",
  FAU: "Firma autenticada — documento correcto",
  FNA: "Firma no autenticada — sin firma válida",
  FAN: "Firma anulada — documento anulado",
  EMP: "En proceso — aún procesando",
  TMD: "Timeout — no respondido a tiempo",
  TMC: "Timeout de consulta",
  MMD: "Monto mal declarado",
  NNC: "Número no correlativo",
  AND: "Aceptado con nota de débito",
  ANC: "Aceptado con nota de crédito",
  UNKNOWN: "Estado desconocido",
};

export type DteAcceptanceStatus =
  | "ACD"
  | "RCD"
  | "ERM"
  | "ACS"
  | "PENDING";

export const DTE_ACCEPTANCE_DESCRIPTION: Record<DteAcceptanceStatus, string> = {
  ACD: "Aceptado — conforme",
  RCD: "Rechazado — no conforme",
  ERM: "Error de recibo de mercaderías",
  ACS: "Aceptado con condición",
  PENDING: "Sin respuesta del receptor",
};

export interface SendResult {
  trackId: string;
  status: SendStatus;
  detail?: string;
  rawResponse: string;
}

export interface StatusQueryResult {
  trackId: string;
  status: SendStatus;
  detail?: string;
  estadisticas?: {
    aceptados: number;
    rechazados: number;
    reparos: number;
  };
  rawResponse: string;
}

export interface DteStatusQueryResult {
  tipoDTE: number;
  folio: number;
  rutEmisor: string;
  status: DteStatus;
  glosa: string;
  rawResponse: string;
}

export interface SiiAuthToken {
  token: string;
  obtainedAt: Date;
  environment: SiiEnvironment;
}

export interface EnvioDTECaratula {
  rutEnvia: string;
  rutEmisor: string;
  rndrOk?: string;
  fechaResolucion: string;
  nroResolucion: number;
  fechaFirmaEnvio: string;
  mnota?: string;
}

export interface BoletaTokenResponse {
  token: string;
  expiresAt: string;
}
