import { TipoDTE } from 'sii-engine';
import {
  commonEmisor,
  commonReceptor,
  originReference,
  runRealSiiLegacyDteSmoke,
  type RealSiiLegacyDteScenario,
} from './support/real-sii-legacy-dte-smoke';

const phase4Scenarios: RealSiiLegacyDteScenario[] = [
  {
    tipoDTE: TipoDTE.NotaCredito,
    label: 'nota de credito 61',
    endpoint: '/api/fiscal/documents/notas-de-credito',
    artifactSlug: 'nota61',
    buildDocument: (input) => ({
      idDoc: {
        tipoDTE: TipoDTE.NotaCredito,
        ...(input.forcedFolio ? { folio: input.forcedFolio } : {}),
        fechaEmision: input.today,
      },
      emisor: commonEmisor(input),
      receptor: commonReceptor('REAL_SII_TEST_DTE_61'),
      detalles: [
        {
          nroLinDet: 1,
          nmbItem: `Smoke nota credito 61 ${input.today}`,
          qtyItem: 1,
          unmdItem: 'UN',
          prcItem: 1000,
          montoItem: 1000,
        },
      ],
      referencias: [
        originReference(1, 'Anulacion total de factura origen'),
      ],
      totales: {
        mntNeto: 1000,
        tasaIVA: 19,
        iva: 190,
        mntTotal: 1190,
      },
    }),
  },
  {
    tipoDTE: TipoDTE.NotaDebito,
    label: 'nota de debito 56',
    endpoint: '/api/fiscal/documents/notas-de-debito',
    artifactSlug: 'nota56',
    buildDocument: (input) => ({
      idDoc: {
        tipoDTE: TipoDTE.NotaDebito,
        ...(input.forcedFolio ? { folio: input.forcedFolio } : {}),
        fechaEmision: input.today,
      },
      emisor: commonEmisor(input),
      receptor: commonReceptor('REAL_SII_TEST_DTE_56'),
      detalles: [
        {
          nroLinDet: 1,
          nmbItem: `Smoke nota debito 56 ${input.today}`,
          qtyItem: 1,
          unmdItem: 'UN',
          prcItem: 100,
          montoItem: 100,
        },
      ],
      referencias: [
        originReference(3, 'Correccion de montos de factura origen'),
      ],
      totales: {
        mntNeto: 100,
        tasaIVA: 19,
        iva: 19,
        mntTotal: 119,
      },
    }),
  },
];

runRealSiiLegacyDteSmoke(
  'Real SII certification flow for phase 4 notes 56/61 (smoke)',
  phase4Scenarios,
);
