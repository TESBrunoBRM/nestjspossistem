import type { TipoDTE } from "./dte.types.js";

export interface CafRsaPk {
  modulus: string;
  exponent: string;
}

export interface CafDa {
  rutEmisor: string;
  razonSocial: string;
  tipoDTE: TipoDTE;
  rangeStart: number;
  rangeEnd: number;
  fechaAutorizacion: string;
  rsaPk: CafRsaPk;
  idk: string;
}

export interface CafData {
  da: CafDa;
  frma: string;
  rsapubk: string;
}

export interface CafMaterial extends CafData {
  rsask: string;
  rawXml: string;
}

export interface FolioAssignment {
  folio: number;
  caf: CafMaterial;
  assignedAt: Date;
}

export interface FolioRange {
  start: number;
  end: number;
  current: number;
  tipoDTE: TipoDTE;
}

export type CafStatus =
  | "active"
  | "exhausted"
  | "expiring_soon"
  | "expired"
  | "invalid";

export interface CafWithStatus {
  caf: CafData;
  status: CafStatus;
  remaining: number;
}
