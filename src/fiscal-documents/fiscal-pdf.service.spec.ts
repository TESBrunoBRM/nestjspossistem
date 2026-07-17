import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { SiiEnvironment, TipoDTE, type DteDocument } from 'sii-engine';
import { FiscalDocumentRepository } from './fiscal-document.repository';
import { FiscalPdfService } from './fiscal-pdf.service';

describe('FiscalPdfService', () => {
  let repository: FiscalDocumentRepository;
  let service: FiscalPdfService;

  beforeEach(() => {
    repository = new FiscalDocumentRepository();
    repository.onModuleInit();
    service = new FiscalPdfService(repository);
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  it.each([
    [TipoDTE.FacturaElectronica, 'a4'],
    [TipoDTE.BoletaElectronica, 'thermal'],
  ] as const)(
    'renders DTE %s using automatic %s format with PDF417',
    async (tipoDTE, expectedFormat) => {
      const record = repository.create({
        internalId: `pdf-${tipoDTE}`,
        tenantId: 'pdf-test',
        environment: SiiEnvironment.Certificacion,
        rutEmisor: '76123456-0',
        tipoDTE,
        folio: tipoDTE,
        status: 'EPR',
        attempts: 0,
        document: fixtureDocument(tipoDTE),
        tedXml:
          '<TED version="1.0"><DD><RE>76123456-0</RE><TD>' +
          tipoDTE +
          '</TD><F>' +
          tipoDTE +
          '</F></DD><FRMT algoritmo="SHA1withRSA">TEST</FRMT></TED>',
      });

      const result = await service.getOrCreate(record, 'auto');

      expect(result.format).toBe(expectedFormat);
      expect(result.buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
      expect(result.buffer.length).toBeGreaterThan(5_000);
      expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);

      const outputDir = process.env.FISCAL_PDF_TEST_OUTPUT_DIR;
      if (outputDir) {
        mkdirSync(outputDir, { recursive: true });
        writeFileSync(
          join(outputDir, `dte-${tipoDTE}-${expectedFormat}.pdf`),
          result.buffer,
        );
      }
    },
  );
});

function fixtureDocument(tipoDTE: TipoDTE): DteDocument {
  return {
    idDoc: {
      tipoDTE,
      folio: tipoDTE,
      fechaEmision: '2026-07-16',
    },
    emisor: {
      rutEmisor: '76123456-0',
      rznSoc: 'EMPRESA DE PRUEBA SPA',
      giroEmis: 'SERVICIOS DE TECNOLOGIA',
      acteco: 620200,
      dirOrigen: 'AVENIDA PROVIDENCIA 1234',
      cmnaOrigen: 'PROVIDENCIA',
    },
    receptor: {
      rutRecep: '60803000-K',
      rznSocRecep: 'SERVICIO DE IMPUESTOS INTERNOS',
      giroRecep: 'ADMINISTRACION PUBLICA',
      dirRecep: 'TEATINOS 120',
      cmnaRecep: 'SANTIAGO',
    },
    detalles: [
      {
        nroLinDet: 1,
        nmbItem: 'Servicio mensual de plataforma',
        qtyItem: 1,
        unmdItem: 'UN',
        prcItem: 10000,
        montoItem: 10000,
      },
      {
        nroLinDet: 2,
        nmbItem: 'Soporte técnico especializado',
        qtyItem: 2,
        unmdItem: 'HR',
        prcItem: 5000,
        montoItem: 10000,
      },
    ],
    totales: {
      mntNeto: 20000,
      tasaIVA: 19,
      iva: 3800,
      mntTotal: 23800,
    },
  };
}
