#!/usr/bin/env node

const { spawn } = require('child_process');

const child = spawn(
  process.execPath,
  [
    '--experimental-vm-modules',
    'node_modules/jest/bin/jest.js',
    '--config',
    './test/jest-smoke.json',
    '--runInBand',
    '--verbose',
    '--testNamePattern',
    'uses only the active CAF 33 already persisted in custody',
    './test/fiscal-real-sii-factura33.smoke-spec.ts',
  ],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      REAL_SII_TEST_SKIP_CAF_REQUEST: 'true',
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
