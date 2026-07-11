#!/usr/bin/env node

const { spawn } = require('child_process');

const folio = Number(process.argv[2]);
if (!Number.isInteger(folio) || folio <= 0) {
  process.stderr.write(
    'Uso: node scripts/real-sii/retry-factura33-folio.cjs <folio>\n',
  );
  process.exit(1);
}

const child = spawn(
  process.execPath,
  [
    '--experimental-vm-modules',
    'node_modules/jest/bin/jest.js',
    '--config',
    './test/jest-smoke.json',
    '--runInBand',
    '--verbose',
    './test/fiscal-real-sii-factura33-retry.smoke-spec.ts',
  ],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      REAL_SII_TEST_RETRY_CONFIRMED_FOLIO: String(folio),
    },
  },
);

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
