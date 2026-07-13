import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { access, readFile } from 'fs/promises';
import { SiiEnvironment, TipoDTE, type IssuerContext } from 'sii-engine';
import { resolveProjectPath } from '../common/utils/project-path.util';
import { FiscalCustodyService } from '../fiscal-storage/fiscal-custody.service';
import { FiscalFolioProvider } from './fiscal-folio.provider';
import { TEST_CAF_AUTHORIZATION_DATE } from '../../test/support/fiscal-fixtures';

jest.mock('fs/promises', () => ({
  access: jest.fn(),
  readFile: jest.fn(),
}));

const mockAccess = jest.mocked(access);
const mockReadFile = jest.mocked(readFile);

const context: IssuerContext = {
  environment: SiiEnvironment.Certificacion,
  rutEmisor: '11111111-1',
  fechaResolucion: '2020-01-01',
  nroResolucion: 0,
};

function mockCustodyService(): FiscalCustodyService {
  return {} as FiscalCustodyService;
}

describe('FiscalFolioProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAccess.mockResolvedValue(undefined);
  });

  it('reserves folios in memory without duplicates', async () => {
    const provider = new FiscalFolioProvider(
      mockConfigService({}),
      mockCustodyService(),
    );
    await provider.addCafXml(context, cafXml('11111111-1', 1, 2));

    const [first, second] = await Promise.all([
      provider.getNextFolio(context, TipoDTE.BoletaElectronica),
      provider.getNextFolio(context, TipoDTE.BoletaElectronica),
    ]);

    expect([first.folio, second.folio].sort()).toEqual([1, 2]);
    await expect(
      provider.getNextFolio(context, TipoDTE.BoletaElectronica),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects CAF from a different issuer', async () => {
    const provider = new FiscalFolioProvider(
      mockConfigService({}),
      mockCustodyService(),
    );

    await expect(
      provider.addCafXml(context, cafXml('22222222-2', 1, 2)),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects folios outside CAF range', async () => {
    const provider = new FiscalFolioProvider(
      mockConfigService({}),
      mockCustodyService(),
    );
    await provider.addCafXml(context, cafXml('11111111-1', 10, 11));

    await expect(
      provider.reserveFolio(context, TipoDTE.BoletaElectronica, 9),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects configured CAF paths without .xml or .txt extension', async () => {
    const provider = new FiscalFolioProvider(
      mockConfigService({ SII_CAF_PATH: 'C:\\secure\\caf.pdf' }),
      mockCustodyService(),
    );

    await expect(provider.onModuleInit()).rejects.toThrow(
      'SII_CAF_PATH debe apuntar a un archivo .xml o .txt',
    );
    expect(mockReadFile).not.toHaveBeenCalled();
  });

  it('rejects local CAF bootstrap in production', async () => {
    const provider = new FiscalFolioProvider(
      mockConfigService({
        NODE_ENV: 'production',
        SII_CAF_PATH: 'C:\\secure\\caf.xml',
      }),
      mockCustodyService(),
    );

    await expect(provider.onModuleInit()).rejects.toThrow(
      'Bootstrap local de CAF no permitido en produccion',
    );
    expect(mockReadFile).not.toHaveBeenCalled();
  });

  it('rejects unreadable configured CAF path', async () => {
    mockAccess.mockRejectedValue(new Error('missing file'));
    const provider = new FiscalFolioProvider(
      mockConfigService({ SII_CAF_PATH: 'C:\\secure\\caf.xml' }),
      mockCustodyService(),
    );

    await expect(provider.onModuleInit()).rejects.toThrow(
      'SII_CAF_PATH no apunta a un archivo legible',
    );
    expect(mockReadFile).not.toHaveBeenCalled();
  });

  it('resolves relative CAF paths from the project root', async () => {
    mockReadFile.mockResolvedValue(cafXml('11111111-1', 1, 2));
    const provider = new FiscalFolioProvider(
      mockConfigService({ SII_CAF_PATH: 'secure/caf-39.xml' }),
      mockCustodyService(),
    );

    await provider.onModuleInit();

    expect(mockAccess).toHaveBeenCalledWith(
      resolveProjectPath('secure/caf-39.xml'),
    );
    expect(mockReadFile).toHaveBeenCalledWith(
      resolveProjectPath('secure/caf-39.xml'),
      'utf8',
    );
  });
});

function mockConfigService(values: Record<string, unknown>): ConfigService {
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

function cafXml(rutEmisor: string, start: number, end: number): string {
  return `<?xml version="1.0" encoding="ISO-8859-1"?>
<AUTORIZACION>
  <CAF version="1.0">
    <DA>
      <RE>${rutEmisor}</RE>
      <RS>EMISOR TEST</RS>
      <TD>39</TD>
      <RNG><D>${start}</D><H>${end}</H></RNG>
      <FA>${TEST_CAF_AUTHORIZATION_DATE}</FA>
      <RSAPK><M>00</M><E>03</E></RSAPK>
      <IDK>1</IDK>
    </DA>
    <FRMA algoritmo="SHA1withRSA">firma</FRMA>
  </CAF>
  <RSASK>private-key</RSASK>
  <RSAPUBK>public-key</RSAPUBK>
</AUTORIZACION>`;
}
