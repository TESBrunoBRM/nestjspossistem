#!/usr/bin/env node

const { spawn } = require('child_process');

const [action, typeRaw, folioRaw] = process.argv.slice(2);
const tipoDTE = Number(typeRaw);
const folio = Number(folioRaw);

if (!['validate', 'prepare', 'reconcile', 'send'].includes(action)) {
  process.stderr.write(
    'Uso: node scripts/real-sii/retry-folio.cjs <validate|prepare|reconcile|send> <33|39> <folio>\n',
  );
  process.exit(1);
}
if (action === 'prepare' && tipoDTE !== 39) {
  process.stderr.write('retry prepare esta disponible solo para boleta DTE 39.\n');
  process.exit(1);
}
if (![33, 39].includes(tipoDTE)) {
  process.stderr.write('El tipo DTE de retry debe ser 33 o 39.\n');
  process.exit(1);
}
if (!Number.isInteger(folio) || folio <= 0) {
  process.stderr.write('El folio de retry debe ser un entero positivo.\n');
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
    './test/fiscal-real-sii-retry.smoke-spec.ts',
  ],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      REAL_SII_TEST_RETRY_DTE_TYPE: String(tipoDTE),
      REAL_SII_TEST_RETRY_CONFIRMED_FOLIO: String(folio),
      REAL_SII_TEST_RETRY_OPERATION: action,
    },
  },
);

child.on('error', (error) => {
  process.stderr.write(`No se pudo iniciar el retry: ${error.message}\n`);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
