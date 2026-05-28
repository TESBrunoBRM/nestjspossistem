import { Injectable, NotFoundException } from '@nestjs/common';
import {
  loadCertificateFromP12,
  loadCertificateFromPem,
  type CertificateMaterial,
  type IssuerContext,
  type SigningProvider,
} from 'sii-engine';

@Injectable()
export class FiscalSecretsService implements SigningProvider {
  private readonly certificates = new Map<string, CertificateMaterial>();

  registerCertificate(ref: string, material: CertificateMaterial): void {
    this.certificates.set(ref, material);
  }

  registerP12(
    ref: string,
    p12Buffer: Buffer,
    password: string,
  ): CertificateMaterial {
    const material = loadCertificateFromP12(p12Buffer, password);
    this.registerCertificate(ref, material);
    return material;
  }

  registerPem(
    ref: string,
    certificatePem: string,
    privateKeyPem: string,
  ): CertificateMaterial {
    const material = loadCertificateFromPem(certificatePem, privateKeyPem);
    this.registerCertificate(ref, material);
    return material;
  }

  async getSigningMaterial(
    context: IssuerContext,
  ): Promise<CertificateMaterial> {
    await Promise.resolve();
    const ref = context.certificateRef ?? 'default';
    const material = this.certificates.get(ref);
    if (!material) {
      throw new NotFoundException(
        'No existe material de firma cargado para el contexto fiscal configurado',
      );
    }
    if (
      context.certificateFingerprint &&
      normalizeFingerprint(material.fingerprintSha256) !==
        normalizeFingerprint(context.certificateFingerprint)
    ) {
      throw new Error(
        'El certificado cargado no coincide con el fingerprint esperado.',
      );
    }

    return material;
  }
}

function normalizeFingerprint(fingerprint?: string): string | undefined {
  return fingerprint?.replace(/[^a-fA-F0-9]/g, '').toLowerCase();
}
