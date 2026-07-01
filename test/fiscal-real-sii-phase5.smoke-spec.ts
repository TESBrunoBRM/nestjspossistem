import { TipoDTE } from 'sii-engine';
import {
  commonEmisor,
  commonReceptor,
  runRealSiiLegacyDteSmoke,
  type RealSiiLegacyDteScenario,
} from './support/real-sii-legacy-dte-smoke';

const phase5Scenarios: RealSiiLegacyDteScenario[] = [
  {
    tipoDTE: TipoDTE.FacturaNoAfectaExentaElectronica,
    label: 'factura exenta 34',
    endpoint: '/api/fiscal/documents/facturas-exentas',
    artifactSlug: 'factura34',
    buildDocument: (input) => ({
      idDoc: {
        tipoDTE: TipoDTE.FacturaNoAfectaExentaElectronica,
        ...(input.forcedFolio ? { folio: input.forcedFolio } : {}),
        fechaEmision: input.today,
        formaPago: 1,
      },
      emisor: commonEmisor(input),
      receptor: commonReceptor('REAL_SII_TEST_DTE_34'),
      detalles: [
        {
          nroLinDet: 1,
          indExe: 1,
          nmbItem: `Smoke factura exenta 34 ${input.today}`,
          qtyItem: 1,
          unmdItem: 'UN',
          prcItem: 1000,
          montoItem: 1000,
        },
      ],
      totales: {
        mntExento: 1000,
        mntTotal: 1000,
      },
    }),
  },
  {
    tipoDTE: TipoDTE.FacturaCompraElectronica,
    label: 'factura de compra 46',
    endpoint: '/api/fiscal/documents/facturas-compra',
    artifactSlug: 'factura46',
    buildDocument: (input) => ({
      idDoc: {
        tipoDTE: TipoDTE.FacturaCompraElectronica,
        ...(input.forcedFolio ? { folio: input.forcedFolio } : {}),
        fechaEmision: input.today,
        formaPago: 1,
      },
      emisor: commonEmisor(input),
      receptor: commonReceptor('REAL_SII_TEST_DTE_46'),
      detalles: [
        {
          nroLinDet: 1,
          nmbItem: `Smoke factura compra 46 ${input.today}`,
          qtyItem: 1,
          unmdItem: 'UN',
          prcItem: 1000,
          montoItem: 1000,
        },
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
    tipoDTE: TipoDTE.GuiaDespachoElectronica,
    label: 'guia de despacho 52',
    endpoint: '/api/fiscal/documents/guias-despacho',
    artifactSlug: 'guia52',
    buildDocument: (input) => ({
      idDoc: {
        tipoDTE: TipoDTE.GuiaDespachoElectronica,
        ...(input.forcedFolio ? { folio: input.forcedFolio } : {}),
        fechaEmision: input.today,
        tipoDespacho: 1,
        indTraslado: 5,
      },
      emisor: commonEmisor(input),
      receptor: commonReceptor('REAL_SII_TEST_DTE_52'),
      detalles: [
        {
          nroLinDet: 1,
          nmbItem: `Smoke guia despacho 52 ${input.today}`,
          qtyItem: 1,
          unmdItem: 'UN',
          prcItem: 0,
          montoItem: 0,
        },
      ],
      totales: {
        mntTotal: 0,
      },
    }),
  },
];

runRealSiiLegacyDteSmoke(
  'Real SII certification flow for phase 5 legacy DTE 34/46/52 (smoke)',
  phase5Scenarios,
);
