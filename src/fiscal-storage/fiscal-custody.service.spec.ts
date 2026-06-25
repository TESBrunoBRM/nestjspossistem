import { ConfigService } from '@nestjs/config';
import {
  SiiEnvironment,
  TipoDTE,
  type CertificateMaterial,
  type IssuerContext,
} from 'sii-engine';
import { loadCertificateMaterialFromP12 } from '../fiscal/fiscal-certificate.util';
import { FiscalCustodyService } from './fiscal-custody.service';

jest.mock('../fiscal/fiscal-certificate.util', () => {
  const actual = jest.requireActual<
    typeof import('../fiscal/fiscal-certificate.util')
  >('../fiscal/fiscal-certificate.util');
  return {
    ...actual,
    loadCertificateMaterialFromP12: jest.fn(),
  };
});

const mockLoadCertificateMaterialFromP12 = jest.mocked(
  loadCertificateMaterialFromP12,
);

const certificateMaterial: CertificateMaterial = {
  privateKeyPem: 'private-key',
  certificatePem: 'certificate-pem',
  rutFirmante: '19157386-2',
  nombre: 'Certificado Test',
  expiresAt: new Date('2030-01-01T00:00:00.000Z'),
  fingerprintSha256: 'AA:BB:CC',
};

const context: IssuerContext = {
  tenantId: 'tenant-a',
  environment: SiiEnvironment.Certificacion,
  rutEmisor: '76123456-0',
  fechaResolucion: '2020-01-01',
  nroResolucion: 80,
  certificateRef: 'issuer:tenant-a:76123456-0:CERTIFICACION',
};

describe('FiscalCustodyService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLoadCertificateMaterialFromP12.mockReturnValue(certificateMaterial);
  });

  it('stores and resolves a fiscal issuer certificate in memory mode', async () => {
    const service = new FiscalCustodyService(mockConfigService({}));

    const result = await service.upsertIssuerCertificate({
      tenantId: 'tenant-a',
      environment: SiiEnvironment.Certificacion,
      rutEmisor: '76123456-0',
      fechaResolucion: '2020-01-01',
      nroResolucion: 80,
      pfxBuffer: Buffer.from('fake-pfx'),
      pfxPassword: 'secret',
    });

    expect(result.profile.certificateRef).toBe(
      'issuer:tenant-a:76123456-0:CERTIFICACION',
    );
    await expect(
      service.findIssuer({
        tenantId: 'tenant-a',
        rutEmisor: '76123456-0',
        environment: SiiEnvironment.Certificacion,
      }),
    ).resolves.toMatchObject({
      rutEmisor: '76123456-0',
      certificateRef: 'issuer:tenant-a:76123456-0:CERTIFICACION',
    });
    await expect(
      service.getSigningMaterialByRef(result.profile.certificateRef),
    ).resolves.toEqual(certificateMaterial);
  });

  it('stores CAF by issuer and serves sequential folios in memory mode', async () => {
    const service = new FiscalCustodyService(mockConfigService({}));
    await service.upsertIssuerCertificate({
      tenantId: 'tenant-a',
      environment: SiiEnvironment.Certificacion,
      rutEmisor: '76123456-0',
      fechaResolucion: '2020-01-01',
      nroResolucion: 80,
      pfxBuffer: Buffer.from('fake-pfx'),
      pfxPassword: 'secret',
    });

    await service.saveCaf({
      context,
      caf: cafMaterial('76123456-0', 100, 102, todayIsoDate()),
    });

    const first = await service.getNextFolio(
      context,
      TipoDTE.BoletaElectronica,
    );
    const second = await service.getNextFolio(
      context,
      TipoDTE.BoletaElectronica,
    );

    expect(first.folio).toBe(100);
    expect(second.folio).toBe(101);

    await expect(
      service.getCafStatus(context, TipoDTE.BoletaElectronica),
    ).resolves.toMatchObject([
      {
        status: 'active',
        remaining: 1,
      },
    ]);
  });
});

function mockConfigService(values: Record<string, unknown>): ConfigService {
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

function cafMaterial(
  rutEmisor: string,
  rangeStart: number,
  rangeEnd: number,
  fechaAutorizacion = '2026-01-01',
) {
  const rawXml = `<?xml version="1.0" encoding="ISO-8859-1"?>
<AUTORIZACION>
  <CAF version="1.0">
    <DA>
      <RE>${rutEmisor}</RE>
      <RS>EMISOR TEST</RS>
      <TD>39</TD>
      <RNG><D>${rangeStart}</D><H>${rangeEnd}</H></RNG>
      <FA>${fechaAutorizacion}</FA>
      <RSAPK><M>00</M><E>03</E></RSAPK>
      <IDK>1</IDK>
    </DA>
    <FRMA algoritmo="SHA1withRSA">firma</FRMA>
  </CAF>
  <RSASK>private-key</RSASK>
  <RSAPUBK>public-key</RSAPUBK>
</AUTORIZACION>`;

  return {
    da: {
      rutEmisor,
      razonSocial: 'EMISOR TEST',
      tipoDTE: TipoDTE.BoletaElectronica,
      rangeStart,
      rangeEnd,
      fechaAutorizacion,
      rsaPk: {
        modulus: '00',
        exponent: '03',
      },
      idk: '1',
    },
    frma: 'firma',
    rsapubk: 'public-key',
    rsask: 'private-key',
    rawXml,
  };
}

function todayIsoDate(): string {
  const today = new Date();
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(
    today.getDate(),
  )}`;
}
