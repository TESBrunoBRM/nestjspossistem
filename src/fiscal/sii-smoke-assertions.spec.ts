import {
  assertExpectedSendStatus,
  assertNormalSmokeDteStatus,
  assertNormalSmokeSendStatus,
} from '../../test/support/sii-smoke-assertions';

describe('SII real smoke assertions', () => {
  it.each(['RSC', 'RCT', 'RFR', 'RCH', 'RPR', 'UNKNOWN'])(
    'rejects %s in a normal send smoke',
    (status) => {
      expect(() => assertNormalSmokeSendStatus(status, 'envio')).toThrow(
        'estado SII no aceptable',
      );
    },
  );

  it.each(['SOK', 'CRT', 'EPR', 'FOK', 'PDR', 'PRD'])(
    'accepts non-rejected send status %s',
    (status) => {
      expect(() => assertNormalSmokeSendStatus(status, 'envio')).not.toThrow();
    },
  );

  it('rejects an EPR envelope whose statistics contain repairs', () => {
    expect(() =>
      assertNormalSmokeSendStatus('EPR', 'envio', undefined, {
        rechazados: 0,
        reparos: 1,
      }),
    ).toThrow('documentos rechazados o con reparos');
  });

  it.each([
    'DNK',
    'FAU',
    'FNA',
    'FAN',
    'EMP',
    'TMD',
    'TMC',
    'MMD',
    'NNC',
    'UNKNOWN',
  ])('rejects failed or inconclusive DTE status %s', (status) => {
    expect(() => assertNormalSmokeDteStatus(status, 'consulta DTE')).toThrow(
      'estado DTE no aceptable o inconcluso',
    );
  });

  it.each(['DOK', 'AND', 'ANC'])(
    'accepts validated DTE status %s',
    (status) => {
      expect(() =>
        assertNormalSmokeDteStatus(status, 'consulta DTE'),
      ).not.toThrow();
    },
  );

  it('allows a rejection only when a test explicitly expects it', () => {
    expect(() =>
      assertExpectedSendStatus('RCH', 'RCH', 'smoke de rechazo'),
    ).not.toThrow();
    expect(() =>
      assertExpectedSendStatus('SOK', 'RCH', 'smoke de rechazo'),
    ).toThrow('esperaba explicitamente RCH');
  });
});
