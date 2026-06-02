/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return */
import { ConfigService } from '@nestjs/config';
import { access, readFile } from 'fs/promises';
import {
  loadCertificateFromP12,
  SiiEnvironment,
  type CertificateMaterial,
  type IssuerContext,
} from 'sii-engine';
import { resolveProjectPath } from '../common/utils/project-path.util';
import { FiscalCustodyService } from '../fiscal-storage/fiscal-custody.service';
import { FiscalSigningProvider } from './fiscal-signing.provider';

jest.mock('fs/promises', () => ({
  access: jest.fn(),
  readFile: jest.fn(),
}));

jest.mock('sii-engine', () => {
  const actual = jest.requireActual('sii-engine');
  return {
    ...actual,
    loadCertificateFromP12: jest.fn(),
  };
});

const mockAccess = jest.mocked(access);
const mockReadFile = jest.mocked(readFile);
const mockLoadCertificateFromP12 = jest.mocked(loadCertificateFromP12);

const material: CertificateMaterial = {
  privateKeyPem: 'private-key',
  certificatePem: 'certificate',
  rutFirmante: '19157386-2',
  nombre: 'Certificado Test',
  expiresAt: new Date('2030-01-01T00:00:00.000Z'),
  fingerprintSha256: 'AA:BB:CC',
};

const context: IssuerContext = {
  environment: SiiEnvironment.Certificacion,
  rutEmisor: '78086484-2',
  fechaResolucion: '2020-01-01',
  nroResolucion: 0,
  certificateRef: 'default',
};

function mockCustodyService(): FiscalCustodyService {
  return {
    getSigningMaterialByRef: jest.fn().mockResolvedValue(undefined),
  } as unknown as FiscalCustodyService;
}

describe('FiscalSigningProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAccess.mockResolvedValue(undefined);
  });

  it('loads a configured PFX certificate without exposing the password through endpoints', async () => {
    const config = createConfigService({
      SII_CERT_REF: 'default',
      SII_PFX_PATH: 'C:\\secure\\cert.pfx',
      SII_PFX_PASSWORD: 'secret-pass',
    });
    const pfxBuffer = Buffer.from('fake-pfx');
    mockReadFile.mockResolvedValue(pfxBuffer);
    mockLoadCertificateFromP12.mockReturnValue(material);

    const provider = new FiscalSigningProvider(config, mockCustodyService());
    await provider.onModuleInit();

    await expect(provider.getSigningMaterial(context)).resolves.toBe(material);
    expect(mockReadFile).toHaveBeenCalledWith('C:\\secure\\cert.pfx');
    expect(mockLoadCertificateFromP12).toHaveBeenCalledWith(
      pfxBuffer,
      'secret-pass',
    );
  });

  it('resolves relative PFX paths from the project root', async () => {
    const config = createConfigService({
      SII_CERT_REF: 'default',
      SII_PFX_PATH: 'secure/certificado.pfx',
      SII_PFX_PASSWORD: 'secret-pass',
    });
    const pfxBuffer = Buffer.from('fake-pfx');
    mockReadFile.mockResolvedValue(pfxBuffer);
    mockLoadCertificateFromP12.mockReturnValue(material);

    const provider = new FiscalSigningProvider(config, mockCustodyService());
    await provider.onModuleInit();

    expect(mockReadFile).toHaveBeenCalledWith(
      resolveProjectPath('secure/certificado.pfx'),
    );
  });

  it('rejects PFX configuration without password before using SII', async () => {
    const provider = new FiscalSigningProvider(
      createConfigService({
        SII_PFX_PATH: 'C:\\secure\\cert.pfx',
      }),
      mockCustodyService(),
    );

    await expect(provider.onModuleInit()).rejects.toThrow(
      'SII_PFX_PASSWORD es requerido',
    );
  });

  it('rejects local certificate bootstrap in production', async () => {
    const provider = new FiscalSigningProvider(
      createConfigService({
        NODE_ENV: 'production',
        SII_PFX_PATH: 'C:\\secure\\cert.pfx',
        SII_PFX_PASSWORD: 'secret-pass',
      }),
      mockCustodyService(),
    );

    await expect(provider.onModuleInit()).rejects.toThrow(
      'Bootstrap local de certificados no permitido en produccion',
    );
    expect(mockReadFile).not.toHaveBeenCalled();
  });

  it('rejects PFX paths without .pfx or .p12 extension', async () => {
    const provider = new FiscalSigningProvider(
      createConfigService({
        SII_PFX_PATH: 'C:\\secure\\certificado',
        SII_PFX_PASSWORD: 'secret-pass',
      }),
      mockCustodyService(),
    );

    await expect(provider.onModuleInit()).rejects.toThrow(
      'SII_PFX_PATH debe apuntar a un archivo con extension .pfx, .p12',
    );
    expect(mockReadFile).not.toHaveBeenCalled();
  });

  it('rejects unreadable PFX path before loading certificate material', async () => {
    mockAccess.mockRejectedValue(new Error('missing file'));
    const provider = new FiscalSigningProvider(
      createConfigService({
        SII_PFX_PATH: 'C:\\secure\\cert.pfx',
        SII_PFX_PASSWORD: 'secret-pass',
      }),
      mockCustodyService(),
    );

    await expect(provider.onModuleInit()).rejects.toThrow(
      'SII_PFX_PATH no apunta a un archivo legible',
    );
    expect(mockReadFile).not.toHaveBeenCalled();
  });

  it('validates certificate fingerprint using fingerprintSha256', async () => {
    const provider = new FiscalSigningProvider(
      createConfigService({}),
      mockCustodyService(),
    );
    provider.registerCertificate('default', material);

    await expect(
      provider.getSigningMaterial({
        ...context,
        certificateFingerprint: 'aa-bb-cc',
      }),
    ).resolves.toBe(material);

    await expect(
      provider.getSigningMaterial({
        ...context,
        certificateFingerprint: '00-11-22',
      }),
    ).rejects.toThrow('fingerprint esperado');
  });

  it('does not leak certificateRef when signing material is missing', async () => {
    const provider = new FiscalSigningProvider(
      createConfigService({}),
      mockCustodyService(),
    );

    await expect(
      provider.getSigningMaterial({
        ...context,
        certificateRef: 'sensitive-ref',
      }),
    ).rejects.toThrow(
      'No existe material de firma cargado para el contexto fiscal configurado',
    );
  });
});

function createConfigService(values: Record<string, string>): ConfigService {
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}
