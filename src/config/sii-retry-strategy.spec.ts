import { TipoDTE } from 'sii-engine';
import { SiiEnvironment } from 'sii-engine';
import {
  assertRetryEnvelopeTimestampIsNotFuture,
  assertRetryEnvelopeTimestampIsFresh,
  createSiiRetryStrategy,
} from '../../test/support/sii-retry-strategy';

describe('SII retry strategies', () => {
  it('selects factura and boleta strategies explicitly', () => {
    const factura = createSiiRetryStrategy(TipoDTE.FacturaElectronica);
    const boleta = createSiiRetryStrategy(TipoDTE.BoletaElectronica);
    expect(factura.artifactPath(16)).toBe(
      'secure/real-sii-tests/artifacts/factura33/16/signed-envio-dte-attempt.xml',
    );
    expect(boleta.artifactPath(34)).toBe(
      'secure/real-sii-tests/artifacts/34/signed-envio-boleta-attempt.xml',
    );
    expect(factura.authScope(SiiEnvironment.Certificacion)).toBe('dte');
    expect(boleta.authScope(SiiEnvironment.Certificacion)).toBe('boleta_rest');
    expect(boleta.authScope(SiiEnvironment.Produccion)).toBe('boleta_rest');
    expect(factura.prepare).toBeUndefined();
    expect(boleta.prepare).toBeDefined();
    expect(factura.schema.schemaName).toBe('EnvioDTE_v10.xsd');
    expect(boleta.schema.schemaName).toBe('EnvioBOLETA_v11.xsd');
    expect(() => createSiiRetryStrategy(56)).toThrow(
      'No existe estrategia de retry',
    );
  });

  it('parses only the envelope family owned by each strategy', () => {
    const factura = createSiiRetryStrategy(TipoDTE.FacturaElectronica);
    const boleta = createSiiRetryStrategy(TipoDTE.BoletaElectronica);
    const facturaXml = envelopeXml('EnvioDTE', 33, 16);
    const boletaXml = envelopeXml('EnvioBOLETA', 39, 34);

    expect(factura.parseEnvelope(facturaXml)).toMatchObject({
      folio: 16,
      tipoDTE: TipoDTE.FacturaElectronica,
      rutEmisor: '78086484-2',
      rutReceptor: '60803000-K',
    });
    expect(boleta.parseEnvelope(boletaXml)).toMatchObject({
      folio: 34,
      tipoDTE: TipoDTE.BoletaElectronica,
      rutEmisor: '78086484-2',
      signatureTimestamp: '2026-07-11T21:00:00',
    });
    expect(() => factura.parseEnvelope(boletaXml)).toThrow('EnvioDTE');
    expect(() => boleta.parseEnvelope(facturaXml)).toThrow('EnvioBOLETA');
  });

  it('blocks envelopes signed in the future for Chile without sending', () => {
    const envelope = {
      folio: 34,
      tipoDTE: TipoDTE.BoletaElectronica,
      rutEmisor: '78086484-2',
      signatureTimestamp: '2026-07-12T01:05:38',
    };

    expect(() =>
      assertRetryEnvelopeTimestampIsNotFuture(
        envelope,
        new Date('2026-07-12T01:36:26Z'),
      ),
    ).toThrow('timestamp futuro para Chile');
    expect(() =>
      assertRetryEnvelopeTimestampIsNotFuture(
        envelope,
        new Date('2026-07-12T05:06:00Z'),
      ),
    ).not.toThrow();
  });

  it('blocks stale prepared envelopes before upload', () => {
    const envelope = {
      folio: 34,
      tipoDTE: TipoDTE.BoletaElectronica,
      rutEmisor: '78086484-2',
      signatureTimestamp: '2026-07-12T15:00:00',
    };

    expect(() =>
      assertRetryEnvelopeTimestampIsFresh(
        envelope,
        new Date('2026-07-12T19:05:00Z'),
      ),
    ).not.toThrow();
    expect(() =>
      assertRetryEnvelopeTimestampIsFresh(
        envelope,
        new Date('2026-07-12T19:20:01Z'),
      ),
    ).toThrow('sobre preparado expiro');
  });
});

function envelopeXml(root: string, tipoDTE: number, folio: number): string {
  return `<${root}>
  <TmstFirmaEnv>2026-07-11T21:00:00</TmstFirmaEnv>
  <DTE>
    <Encabezado>
      <IdDoc><TipoDTE>${tipoDTE}</TipoDTE><Folio>${folio}</Folio><FchEmis>2026-07-11</FchEmis></IdDoc>
      <Emisor><RUTEmisor>78086484-2</RUTEmisor></Emisor>
      <Receptor><RUTRecep>60803000-K</RUTRecep></Receptor>
      <Totales><MntTotal>500</MntTotal></Totales>
    </Encabezado>
  </DTE>
</${root}>`;
}
