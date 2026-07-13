const { resolveCommand } = require('../../scripts/cli/sii-cert.cjs') as {
  resolveCommand: (args: string[]) => {
    help: boolean;
    dockerArgs: string[];
    message?: string;
  };
};

describe('sii:cert CLI', () => {
  it('accepts the argument separator forwarded by pnpm', () => {
    const result = resolveCommand(['--', 'caf', 'acquire', '--type=33']);
    expect(result.dockerArgs).toContain('caf-acquisition');
    expect(result.dockerArgs).toContain('REAL_SII_TEST_CAF_TYPE=33');
  });

  it.each([
    ['33', '33'],
    ['factura', '33'],
    ['39', '39'],
    ['boleta', '39'],
  ])('normalizes CAF type %s to %s', (input, expected) => {
    const result = resolveCommand(['caf', 'acquire', `--type=${input}`]);
    expect(result.dockerArgs).toContain(`REAL_SII_TEST_CAF_TYPE=${expected}`);
    expect(result.dockerArgs).toContain('caf-acquisition');
  });

  it('routes emission by DTE type', () => {
    expect(resolveCommand(['emit', '--type=33']).dockerArgs).toContain(
      'emit-factura33',
    );
    expect(resolveCommand(['emit', '--type=39']).dockerArgs).toContain(
      'emit-boleta39',
    );
  });

  it('checks custody without routing through CAF acquisition', () => {
    const result = resolveCommand(['caf', 'check', '--type=factura']);
    expect(result.dockerArgs).toContain('caf-check');
    expect(result.dockerArgs).not.toContain('caf-acquisition');
    expect(result.message).toContain('no contacta al SII');
  });

  it('passes a bounded CAF quantity', () => {
    const result = resolveCommand([
      'caf',
      'acquire',
      '--type=39',
      '--quantity=5',
    ]);
    expect(result.dockerArgs).toContain('REAL_SII_TEST_CAF_QUANTITY=5');
    expect(() =>
      resolveCommand(['caf', 'acquire', '--type=39', '--quantity=51']),
    ).toThrow('no puede superar 50');
  });

  it('fails closed for missing or unsupported types', () => {
    expect(() => resolveCommand(['emit'])).toThrow('Falta --type');
    expect(() => resolveCommand(['emit', '--type=34'])).toThrow(
      'Tipo DTE no soportado',
    );
    expect(() => resolveCommand(['emit', '--type=factura33'])).toThrow(
      'Tipo DTE no soportado',
    );
    expect(() =>
      resolveCommand(['caf', 'check', '--type=33', '--quantity=1']),
    ).toThrow('--quantity solo aplica');
  });

  it('keeps CAF acquisition separate from emission', () => {
    const result = resolveCommand(['emit', '--type=39']);
    expect(result.dockerArgs).not.toContain('caf-acquisition');
    expect(result.message).toContain('consume un folio');
  });

  it.each([
    ['33', 'emit-factura33'],
    ['39', 'emit-boleta39'],
  ])('routes retry through the strategy for DTE %s', (type, service) => {
    const validate = resolveCommand([
      'retry',
      'validate',
      `--type=${type}`,
      '--folio=34',
    ]);
    expect(validate.dockerArgs).toContain(service);
    expect(validate.dockerArgs).toContain('--no-deps');
    expect(validate.dockerArgs).toContain(
      `REAL_SII_TEST_RETRY_DTE_TYPE=${type}`,
    );
    expect(validate.dockerArgs).toContain(
      'REAL_SII_TEST_RETRY_CONFIRMED_FOLIO=34',
    );
    expect(validate.dockerArgs).toContain(
      'REAL_SII_TEST_RETRY_OPERATION=validate',
    );
    expect(validate.dockerArgs).toContain(
      './test/fiscal-real-sii-retry.smoke-spec.ts',
    );

    const reconcile = resolveCommand([
      'retry',
      'reconcile',
      `--type=${type}`,
      '--folio=34',
    ]);
    expect(reconcile.dockerArgs).toContain(service);
    expect(reconcile.dockerArgs).not.toContain('--no-deps');
    expect(reconcile.message).toContain('No realiza upload');

    if (type === '39') {
      const prepare = resolveCommand([
        'retry',
        'prepare',
        '--type=39',
        '--folio=34',
      ]);
      expect(prepare.dockerArgs).toContain(service);
      expect(prepare.message).toContain('sin upload');
    }

    const send = resolveCommand([
      'retry',
      'send',
      `--type=${type}`,
      '--folio=34',
    ]);
    expect(send.dockerArgs).toContain(service);
    expect(send.dockerArgs).not.toContain('--no-deps');
  });

  it('limits controlled preparation to boleta 39', () => {
    expect(() =>
      resolveCommand(['retry', 'prepare', '--type=33', '--folio=16']),
    ).toThrow('solo para boleta DTE 39');
  });

  it('injects an explicit historical tenant only for the retry process', () => {
    const result = resolveCommand([
      'retry',
      'prepare',
      '--type=39',
      '--folio=34',
      '--tenant=real-sii-smoke',
    ]);
    expect(result.dockerArgs).toContain(
      'REAL_SII_TEST_TENANT_ID=real-sii-smoke',
    );
    expect(() =>
      resolveCommand([
        'retry',
        'prepare',
        '--type=39',
        '--folio=34',
        '--tenant=../otro',
      ]),
    ).toThrow('--tenant debe usar');
  });
});
