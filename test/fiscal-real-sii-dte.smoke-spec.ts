import { TipoDTE } from 'sii-engine';
import {
  commonEmisor,
  commonReceptor,
  originReference,
  runRealSiiLegacyDteSmoke,
  type RealSiiLegacyDteScenario,
} from './support/real-sii-legacy-dte-smoke';
import { parseCertificationDteType } from './support/sii-certification-options';

const scenarios = new Map<number, RealSiiLegacyDteScenario>([
  [
    TipoDTE.FacturaNoAfectaExentaElectronica,
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
  ],
  [
    TipoDTE.BoletaNoAfectaExentaElectronica,
    {
      tipoDTE: TipoDTE.BoletaNoAfectaExentaElectronica,
      label: 'boleta exenta 41',
      endpoint: '/api/fiscal/documents/boletas',
      artifactSlug: 'boleta41',
      buildDocument: (input) => ({
        idDoc: {
          tipoDTE: TipoDTE.BoletaNoAfectaExentaElectronica,
          ...(input.forcedFolio ? { folio: input.forcedFolio } : {}),
          fechaEmision: input.today,
          indServicio: 3,
        },
        emisor: commonEmisor(input),
        receptor: commonReceptor('REAL_SII_TEST_DTE_41'),
        detalles: [
          {
            nroLinDet: 1,
            indExe: 1,
            nmbItem: `Smoke boleta exenta 41 ${input.today}`,
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
  ],
  [
    TipoDTE.NotaDebito,
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
  ],
  [
    TipoDTE.NotaCredito,
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
        referencias: [originReference(1, 'Anulacion total de factura origen')],
        totales: {
          mntNeto: 1000,
          tasaIVA: 19,
          iva: 190,
          mntTotal: 1190,
        },
      }),
    },
  ],
]);

const tipoDTE = parseCertificationDteType();
const scenario = scenarios.get(tipoDTE);
if (!scenario) {
  throw new Error(
    `El smoke DTE generico admite 34, 41, 56 o 61; valor recibido: ${tipoDTE}.`,
  );
}

runRealSiiLegacyDteSmoke(
  `Real SII certification flow for DTE ${tipoDTE} (smoke)`,
  [scenario],
);
