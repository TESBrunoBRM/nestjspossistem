import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { access, readFile } from 'fs/promises';
import { extname } from 'path';
import forge from 'node-forge';
import {
  getCertificateFingerprintSha256,
  loadCertificateFromP12,
  loadCertificateFromPem,
  normalizeRut,
  type CertificateMaterial,
  type IssuerContext,
  type SigningProvider,
} from 'sii-engine';

@Injectable()
export class FiscalSigningProvider implements SigningProvider, OnModuleInit {
  private readonly logger = new Logger(FiscalSigningProvider.name);
  private readonly certificates = new Map<string, CertificateMaterial>();

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    this.assertNoProductionLocalBootstrap();

    const ref = this.getConfiguredRef();
    const pfxPath = this.configService.get<string>('SII_PFX_PATH');
    const pfxPassword = this.configService.get<string>('SII_PFX_PASSWORD');
    const pemCertPath = this.configService.get<string>('SII_CERT_PEM_PATH');
    const pemKeyPath = this.configService.get<string>('SII_KEY_PEM_PATH');

    if (pfxPath) {
      if (!pfxPassword) {
        throw new Error(
          'SII_PFX_PASSWORD es requerido cuando SII_PFX_PATH esta configurado',
        );
      }
      await this.assertReadableFile(pfxPath, ['.pfx', '.p12'], 'SII_PFX_PATH');
      const pfx = await readFile(pfxPath);
      this.registerP12(ref, pfx, pfxPassword);
      this.logger.log('Certificado PFX cargado desde bootstrap local');
      return;
    }

    if (pemCertPath || pemKeyPath) {
      if (!pemCertPath || !pemKeyPath) {
        throw new Error(
          'SII_CERT_PEM_PATH y SII_KEY_PEM_PATH deben configurarse juntos',
        );
      }
      await this.assertReadableFile(
        pemCertPath,
        ['.pem', '.crt', '.cer'],
        'SII_CERT_PEM_PATH',
      );
      await this.assertReadableFile(
        pemKeyPath,
        ['.pem', '.key'],
        'SII_KEY_PEM_PATH',
      );
      const [certPem, keyPem] = await Promise.all([
        readFile(pemCertPath, 'utf8'),
        readFile(pemKeyPath, 'utf8'),
      ]);
      this.registerPem(ref, certPem, keyPem);
      this.logger.log('Certificado PEM cargado desde bootstrap local');
    }
  }

  registerCertificate(ref: string, material: CertificateMaterial): void {
    this.certificates.set(ref, material);
  }

  registerP12(
    ref: string,
    p12Buffer: Buffer,
    password: string,
  ): CertificateMaterial {
    const material = this.loadP12Material(p12Buffer, password);
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
    const ref = context.certificateRef ?? this.getConfiguredRef();
    const material = this.certificates.get(ref);

    if (!material) {
      throw new Error(
        'No existe material de firma cargado para el contexto fiscal configurado',
      );
    }

    if (
      context.certificateFingerprint &&
      normalizeFingerprint(material.fingerprintSha256) !==
        normalizeFingerprint(context.certificateFingerprint)
    ) {
      throw new Error(
        'El certificado cargado no coincide con el fingerprint esperado',
      );
    }

    return material;
  }

  private getConfiguredRef(): string {
    return this.configService.get<string>('SII_CERT_REF') ?? 'default';
  }

  private assertNoProductionLocalBootstrap(): void {
    if (this.configService.get<string>('NODE_ENV') !== 'production') return;

    const configuredKeys = [
      'SII_PFX_PATH',
      'SII_PFX_PASSWORD',
      'SII_CERT_PEM_PATH',
      'SII_KEY_PEM_PATH',
    ].filter((key) => {
      const value = this.configService.get<string>(key);
      return value !== undefined && value !== '';
    });

    if (configuredKeys.length > 0) {
      throw new Error(
        `Bootstrap local de certificados no permitido en produccion (${configuredKeys.join(', ')}). Use un FiscalSigningProvider productivo por tenant/emisor.`,
      );
    }
  }

  private loadP12Material(
    p12Buffer: Buffer,
    password: string,
  ): CertificateMaterial {
    try {
      return loadCertificateFromP12(p12Buffer, password);
    } catch (error) {
      if (!isMissingRutError(error)) throw error;

      const rutFirmante = this.configService.get<string>('SII_RUT_FIRMANTE');
      if (!rutFirmante) {
        throw new Error(
          'SII_RUT_FIRMANTE es requerido porque el certificado no declara RUT tributario en sus atributos',
        );
      }

      return loadCertificateFromP12WithRutOverride(
        p12Buffer,
        password,
        rutFirmante,
      );
    }
  }

  private async assertReadableFile(
    filePath: string,
    allowedExtensions: string[],
    configKey: string,
  ): Promise<void> {
    const extension = extname(filePath).toLowerCase();
    if (!allowedExtensions.includes(extension)) {
      throw new Error(
        `${configKey} debe apuntar a un archivo con extension ${allowedExtensions.join(', ')}`,
      );
    }

    try {
      await access(filePath);
    } catch {
      throw new Error(`${configKey} no apunta a un archivo legible`);
    }
  }
}

function normalizeFingerprint(fingerprint?: string): string | undefined {
  return fingerprint?.replace(/[^a-fA-F0-9]/g, '').toLowerCase();
}

function isMissingRutError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes('RUT tributario') &&
    error.message.includes('atributos')
  );
}

function loadCertificateFromP12WithRutOverride(
  p12Buffer: Buffer,
  password: string,
  rutFirmante: string,
): CertificateMaterial {
  const normalizedRut = normalizeRut(rutFirmante);
  const p12Der = forge.util.createBuffer(p12Buffer.toString('binary'));
  const p12Asn1 = forge.asn1.fromDer(p12Der);
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);

  const certBags = Object.values(
    p12.getBags({ bagType: forge.pki.oids.certBag }),
  ).flat() as Array<{ cert?: forge.pki.Certificate }>;
  const keyBags = Object.values(
    p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag }),
  ).flat() as Array<{ key?: forge.pki.PrivateKey }>;

  if (certBags.length === 0 || keyBags.length === 0) {
    throw new Error('El PFX no contiene certificado y clave privada validos');
  }

  const pair = findMatchingP12Pair(certBags, keyBags);
  if (!pair) {
    throw new Error('El PFX no contiene un par certificado/clave coincidente');
  }

  const expiresAt = new Date(pair.cert.validity.notAfter);
  if (expiresAt < new Date()) {
    throw new Error(`El certificado expiro el ${expiresAt.toISOString()}`);
  }

  const certificatePem = forge.pki.certificateToPem(pair.cert);

  return {
    privateKeyPem: forge.pki.privateKeyToPem(pair.privateKey),
    certificatePem,
    rutFirmante: normalizedRut,
    nombre: extractCertificateName(pair.cert),
    expiresAt,
    fingerprintSha256: getCertificateFingerprintSha256(certificatePem),
  };
}

function findMatchingP12Pair(
  certBags: Array<{ cert?: forge.pki.Certificate }>,
  keyBags: Array<{ key?: forge.pki.PrivateKey }>,
):
  | { cert: forge.pki.Certificate; privateKey: forge.pki.PrivateKey }
  | undefined {
  for (const keyBag of keyBags) {
    if (!keyBag.key) continue;
    const privateKey = keyBag.key as forge.pki.rsa.PrivateKey;
    if (!privateKey.n) continue;

    for (const certBag of certBags) {
      if (!certBag.cert) continue;
      const publicKey = certBag.cert.publicKey as forge.pki.rsa.PublicKey;
      if (!publicKey.n) continue;

      if (privateKey.n.toString(16) === publicKey.n.toString(16)) {
        return { cert: certBag.cert, privateKey };
      }
    }
  }

  return undefined;
}

function extractCertificateName(cert: forge.pki.Certificate): string {
  const commonName = getAttributeValue(cert.subject.getField('CN'));
  if (commonName) return commonName;

  const organization = getAttributeValue(cert.subject.getField('O'));
  if (organization) return organization;

  return '';
}

function getAttributeValue(attribute: unknown): string | undefined {
  if (
    typeof attribute === 'object' &&
    attribute !== null &&
    'value' in attribute
  ) {
    return String(attribute.value);
  }

  return undefined;
}
