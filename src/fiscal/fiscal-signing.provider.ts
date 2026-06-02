import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { access, readFile } from 'fs/promises';
import { extname } from 'path';
import {
  type CertificateMaterial,
  type IssuerContext,
  type SigningProvider,
} from 'sii-engine';
import { resolveProjectPath } from '../common/utils/project-path.util';
import { FiscalCustodyService } from '../fiscal-storage/fiscal-custody.service';
import {
  loadCertificateMaterialFromP12,
  loadCertificateMaterialFromPem,
  normalizeFingerprint,
} from './fiscal-certificate.util';

@Injectable()
export class FiscalSigningProvider implements SigningProvider, OnModuleInit {
  private readonly logger = new Logger(FiscalSigningProvider.name);
  private readonly certificates = new Map<string, CertificateMaterial>();

  constructor(
    private readonly configService: ConfigService,
    private readonly custodyService: FiscalCustodyService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.assertNoProductionLocalBootstrap();

    const ref = this.getConfiguredRef();
    const pfxPath = this.configService.get<string>('SII_PFX_PATH');
    const pfxPassword = this.configService.get<string>('SII_PFX_PASSWORD');
    const pemCertPath = this.configService.get<string>('SII_CERT_PEM_PATH');
    const pemKeyPath = this.configService.get<string>('SII_KEY_PEM_PATH');

    if (pfxPath) {
      const resolvedPfxPath = resolveProjectPath(pfxPath);
      if (!pfxPassword) {
        throw new Error(
          'SII_PFX_PASSWORD es requerido cuando SII_PFX_PATH esta configurado',
        );
      }
      await this.assertReadableFile(
        resolvedPfxPath,
        ['.pfx', '.p12'],
        'SII_PFX_PATH',
      );
      const pfx = await readFile(resolvedPfxPath);
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
      const resolvedPemCertPath = resolveProjectPath(pemCertPath);
      const resolvedPemKeyPath = resolveProjectPath(pemKeyPath);
      await this.assertReadableFile(
        resolvedPemCertPath,
        ['.pem', '.crt', '.cer'],
        'SII_CERT_PEM_PATH',
      );
      await this.assertReadableFile(
        resolvedPemKeyPath,
        ['.pem', '.key'],
        'SII_KEY_PEM_PATH',
      );
      const [certPem, keyPem] = await Promise.all([
        readFile(resolvedPemCertPath, 'utf8'),
        readFile(resolvedPemKeyPath, 'utf8'),
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
    const material = loadCertificateMaterialFromP12(
      p12Buffer,
      password,
      this.configService.get<string>('SII_RUT_FIRMANTE'),
    );
    this.registerCertificate(ref, material);
    return material;
  }

  registerPem(
    ref: string,
    certificatePem: string,
    privateKeyPem: string,
  ): CertificateMaterial {
    const material = loadCertificateMaterialFromPem(
      certificatePem,
      privateKeyPem,
    );
    this.registerCertificate(ref, material);
    return material;
  }

  async getSigningMaterial(
    context: IssuerContext,
  ): Promise<CertificateMaterial> {
    await Promise.resolve();
    const ref = context.certificateRef ?? this.getConfiguredRef();
    const material = this.certificates.get(ref);
    if (material) {
      this.assertFingerprint(context, material);
      return material;
    }

    const persisted = await this.custodyService.getSigningMaterialByRef(ref);
    if (!persisted) {
      throw new Error(
        'No existe material de firma cargado para el contexto fiscal configurado',
      );
    }
    this.certificates.set(ref, persisted);
    this.assertFingerprint(context, persisted);
    return persisted;
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

  private assertFingerprint(
    context: IssuerContext,
    material: CertificateMaterial,
  ): void {
    if (
      context.certificateFingerprint &&
      normalizeFingerprint(material.fingerprintSha256) !==
        normalizeFingerprint(context.certificateFingerprint)
    ) {
      throw new Error(
        'El certificado cargado no coincide con el fingerprint esperado',
      );
    }
  }
}
