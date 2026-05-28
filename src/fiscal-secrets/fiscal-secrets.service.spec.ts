import { NotFoundException } from '@nestjs/common';
import {
  SiiEnvironment,
  type CertificateMaterial,
  type IssuerContext,
} from 'sii-engine';
import { FiscalSecretsService } from './fiscal-secrets.service';

const context: IssuerContext = {
  environment: SiiEnvironment.Certificacion,
  rutEmisor: '76123456-7',
  fechaResolucion: '2020-01-01',
  nroResolucion: 0,
  certificateRef: 'cert-a',
};

const material: CertificateMaterial = {
  privateKeyPem: 'private',
  certificatePem: 'cert',
  rutFirmante: '12345678-9',
  nombre: 'Firmante Test',
  expiresAt: new Date('2099-01-01T00:00:00Z'),
  fingerprintSha256: 'fingerprint-a',
};

describe('FiscalSecretsService', () => {
  it('returns registered certificate material by reference', async () => {
    const service = new FiscalSecretsService();
    service.registerCertificate('cert-a', material);

    await expect(service.getSigningMaterial(context)).resolves.toBe(material);
  });

  it('throws when a certificate reference is not registered', async () => {
    const service = new FiscalSecretsService();

    await expect(service.getSigningMaterial(context)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
