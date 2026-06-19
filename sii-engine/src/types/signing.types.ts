import { IssuerContext } from "./context.types.js";

export interface CertificateMaterial {
  privateKeyPem: string;
  certificatePem: string;
  rutFirmante: string;
  nombre: string;
  expiresAt: Date;
  fingerprintSha256?: string;
}

export interface SigningProvider {
  getSigningMaterial(context: IssuerContext): Promise<CertificateMaterial>;
}

export interface CafSigningKey {
  privateKeyDer: string;
}

export interface XmlSignatureOptions {
  referenceId: string;
  includeKeyInfo?: boolean;
}

export interface TedSignatureResult {
  frma: string;
  algorithm: "SHA1withRSA";
}

export interface DocumentSignatureResult {
  signatureXml: string;
  digestValue: string;
  signatureValue: string;
}
