import {
  SiiEnvironment,
  type CafMaterial,
  type CertificateMaterial,
  type IssuerContext,
  type TipoDTE,
} from 'sii-engine';

export interface FiscalIssuerLookup {
  tenantId?: string;
  merchantId?: string;
  branchId?: string;
  rutEmisor?: string;
  environment?: SiiEnvironment;
}

export interface UpsertFiscalIssuerInput {
  tenantId: string;
  merchantId?: string;
  branchId?: string;
  environment: SiiEnvironment;
  rutEmisor: string;
  fechaResolucion: string;
  nroResolucion: number;
  pfxBuffer: Buffer;
  pfxPassword: string;
  rutFirmante?: string;
}

export interface StoredFiscalIssuerProfile {
  tenantId: string;
  merchantId?: string;
  branchId?: string;
  environment: SiiEnvironment;
  rutEmisor: string;
  rutFirmante?: string;
  fechaResolucion: string;
  nroResolucion: number;
  certificateRef: string;
  certificateFingerprint: string;
  certificateExpiresAt: string;
  certificateObjectKey: string;
  certificatePasswordParameterName: string;
  updatedAt: string;
  createdAt: string;
}

export interface StoredFiscalIssuerCertificate {
  profile: StoredFiscalIssuerProfile;
  material: CertificateMaterial;
}

export interface StoredFiscalCafRecord {
  tenantId: string;
  environment: SiiEnvironment;
  rutEmisor: string;
  razonSocial: string;
  tipoDTE: TipoDTE;
  rangeStart: number;
  rangeEnd: number;
  idk: string;
  nextFolio: number;
  fechaAutorizacion: string;
  cafObjectKey: string;
  updatedAt: string;
  createdAt: string;
}

export interface SaveCafInput {
  context: IssuerContext;
  caf: CafMaterial;
}
