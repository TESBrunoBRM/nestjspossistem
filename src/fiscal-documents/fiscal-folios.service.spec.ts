import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import forge from 'node-forge';
import { SiiEnvironment, TipoDTE, type IssuerContext } from 'sii-engine';
import { FiscalContextResolver } from '../fiscal/fiscal-context.resolver';
import type { IssuerContextDto } from '../fiscal/dto/issuer-context.dto';
import { FISCAL_ISSUER_STORE } from '../fiscal/fiscal-issuer.store';
import { FISCAL_FOLIO_PROVIDER } from './fiscal-documents.tokens';
import { FiscalFolioProvider } from './fiscal-folio.provider';
import { FiscalFoliosService } from './fiscal-folios.service';

const context: IssuerContext = {
  environment: SiiEnvironment.Certificacion,
  rutEmisor: '11111111-1',
  fechaResolucion: '2020-01-01',
  nroResolucion: 80,
  certificateRef: 'default',
};

const contextDto = {
  fechaResolucion: '2020-01-01',
  nroResolucion: 80,
};

describe('FiscalFoliosService', () => {
  let service: FiscalFoliosService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FiscalFoliosService,
        FiscalFolioProvider,
        {
          provide: FISCAL_FOLIO_PROVIDER,
          useExisting: FiscalFolioProvider,
        },
        FiscalContextResolver,
        {
          provide: FISCAL_ISSUER_STORE,
          useValue: {
            resolveIssuer: jest.fn((lookup?: IssuerContextDto) => ({
              ...context,
              tenantId: lookup?.tenantId,
              merchantId: lookup?.merchantId,
              branchId: lookup?.branchId,
              fechaResolucion:
                lookup?.fechaResolucion ?? context.fechaResolucion,
              nroResolucion: lookup?.nroResolucion ?? context.nroResolucion,
            })),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(FiscalFoliosService);
  });

  it('imports a valid CAF and returns only public metadata', async () => {
    const result = await importCaf(service, '11111111-1', 1, 5);

    expect(result).toMatchObject({
      rutEmisor: '11111111-1',
      tipoDTE: TipoDTE.BoletaElectronica,
      rangeStart: 1,
      rangeEnd: 5,
      fechaAutorizacion: '2026-01-01',
    });
    expectPublicPayloadSafe(result);
  });

  it('rejects CAF from a different issuer', async () => {
    await expect(importCaf(service, '22222222-2', 1, 5)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('gets public folio status', async () => {
    await importCaf(service, '11111111-1', 1, 3);

    const result = await service.getStatus({
      ...contextDto,
      tipoDTE: TipoDTE.BoletaElectronica,
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      status: 'active',
      remaining: 3,
      caf: {
        rutEmisor: '11111111-1',
        rangeStart: 1,
        rangeEnd: 3,
      },
    });
    expectPublicPayloadSafe(result);
  });

  it('reserves the next folio', async () => {
    await importCaf(service, '11111111-1', 1, 3);

    const result = await service.reserve({
      context: contextDto,
      tipoDTE: TipoDTE.BoletaElectronica,
    });

    expect(result.folio).toBe(1);
    expect(result.caf.rangeStart).toBe(1);
    expectPublicPayloadSafe(result);
  });

  it('reserves a specific folio', async () => {
    await importCaf(service, '11111111-1', 1, 3);

    const result = await service.reserve({
      context: contextDto,
      tipoDTE: TipoDTE.BoletaElectronica,
      folio: 2,
    });

    expect(result.folio).toBe(2);
    expectPublicPayloadSafe(result);
  });

  it('rejects a folio outside CAF range', async () => {
    await importCaf(service, '11111111-1', 1, 3);

    await expect(
      service.reserve({
        context: contextDto,
        tipoDTE: TipoDTE.BoletaElectronica,
        folio: 99,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects duplicate folio reservation', async () => {
    await importCaf(service, '11111111-1', 1, 3);

    await service.reserve({
      context: contextDto,
      tipoDTE: TipoDTE.BoletaElectronica,
      folio: 2,
    });

    await expect(
      service.reserve({
        context: contextDto,
        tipoDTE: TipoDTE.BoletaElectronica,
        folio: 2,
      }),
    ).rejects.toThrow(BadRequestException);
  });
});

function importCaf(
  service: FiscalFoliosService,
  rutEmisor: string,
  start: number,
  end: number,
) {
  return service.importCaf({
    context: contextDto,
    cafXml: cafXml(rutEmisor, start, end),
  });
}

function expectPublicPayloadSafe(body: unknown): void {
  const serialized = JSON.stringify(body);

  expect(serialized).not.toMatch(
    /RSASK|rawXml|<CAF|PRIVATE KEY|privateKey|token|password/i,
  );
}

function cafXml(rutEmisor: string, start: number, end: number): string {
  const keys = forge.pki.rsa.generateKeyPair(512);
  const privateKeyAsn1 = forge.pki.privateKeyToAsn1(keys.privateKey);
  const privateKeyDer = forge.asn1.toDer(privateKeyAsn1).getBytes();
  const rsask = forge.util.encode64(privateKeyDer);

  const publicKeyAsn1 = forge.pki.publicKeyToAsn1(keys.publicKey);
  const publicKeyDer = forge.asn1.toDer(publicKeyAsn1).getBytes();
  const rsapubk = forge.util.encode64(publicKeyDer);

  return `<?xml version="1.0" encoding="ISO-8859-1"?>
<AUTORIZACION>
  <CAF version="1.0">
    <DA>
      <RE>${rutEmisor}</RE>
      <RS>EMISOR TEST</RS>
      <TD>39</TD>
      <RNG><D>${start}</D><H>${end}</H></RNG>
      <FA>2026-01-01</FA>
      <RSAPK>
        <M>${rsapubk}</M>
        <E>Aw==</E>
      </RSAPK>
      <IDK>1</IDK>
    </DA>
    <FRMA algoritmo="SHA1withRSA">firma</FRMA>
  </CAF>
  <RSASK>${rsask}</RSASK>
  <RSAPUBK>${rsapubk}</RSAPUBK>
</AUTORIZACION>`;
}
