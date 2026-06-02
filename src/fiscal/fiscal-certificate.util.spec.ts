import { createTestPfxWithoutRut } from '../../test/support/fiscal-fixtures';
import { loadCertificateMaterialFromP12 } from './fiscal-certificate.util';

describe('loadCertificateMaterialFromP12', () => {
  it('loads a valid PFX without explicit RUT when rutFirmante override is provided', () => {
    const pfxPassword = 'override-password';
    const rutFirmante = '19157386-2';
    const pfx = createTestPfxWithoutRut(pfxPassword);

    const material = loadCertificateMaterialFromP12(
      pfx.pfxBuffer,
      pfxPassword,
      rutFirmante,
    );

    expect(material.rutFirmante).toBe(rutFirmante);
    expect(material.certificatePem).toContain('BEGIN CERTIFICATE');
    expect(material.privateKeyPem).toContain('BEGIN RSA PRIVATE KEY');
  });

  it('fails when the certificate has no explicit RUT and no override was supplied', () => {
    const pfxPassword = 'override-password';
    const pfx = createTestPfxWithoutRut(pfxPassword);

    expect(() =>
      loadCertificateMaterialFromP12(pfx.pfxBuffer, pfxPassword),
    ).toThrow('RUT tributario');
  });
});
