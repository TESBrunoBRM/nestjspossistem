#!/usr/bin/env node

const { spawn } = require('child_process');

const COMPOSE_ARGS = ['-f', 'compose.yaml', '-f', 'compose.certification.yaml'];

const DTE_TYPES = new Map([
  ['33', { code: 33, name: 'factura' }],
  ['factura', { code: 33, name: 'factura' }],
  ['39', { code: 39, name: 'boleta' }],
  ['boleta', { code: 39, name: 'boleta' }],
]);

function resolveCommand(argv) {
  if (argv[0] === '--') {
    argv = argv.slice(1);
  }

  if (argv.length === 0 || ['help', '--help', '-h'].includes(argv[0])) {
    return { help: true, dockerArgs: [] };
  }

  const [command, actionOrOption, ...tail] = argv;

  if (command === 'down') {
    assertNoArguments(argv.slice(1), 'down');
    return commandResult(
      ['down'],
      'Deteniendo certificacion; el volumen fiscal se conserva.',
    );
  }

  if (command === 'custody') {
    if (actionOrOption !== 'test') {
      throw new Error('Uso: sii:cert -- custody test');
    }
    assertNoArguments(tail, 'custody test');
    return commandResult(
      ['run', '--rm', 'custody-test'],
      'Validando custodia local sin contactar al SII.',
    );
  }

  if (command === 'caf') {
    if (!['acquire', 'check'].includes(actionOrOption)) {
      throw new Error('Uso: sii:cert -- caf <acquire|check> --type=<33|39>');
    }
    const options = parseOptions(tail);
    const type = requireDteType(options.type);
    const quantity = parseQuantity(options.quantity, actionOrOption);
    assertAllowedOptions(options, [
      'type',
      ...(actionOrOption === 'acquire' ? ['quantity'] : []),
    ]);

    const dockerArgs = [
      'run',
      '--rm',
      '-e',
      `REAL_SII_TEST_CAF_TYPE=${type.code}`,
    ];
    if (quantity !== undefined) {
      dockerArgs.push('-e', `REAL_SII_TEST_CAF_QUANTITY=${quantity}`);
    }
    dockerArgs.push(
      actionOrOption === 'acquire' ? 'caf-acquisition' : 'caf-check',
    );

    return commandResult(
      dockerArgs,
      actionOrOption === 'acquire'
        ? `Solicitando CAF DTE ${type.code} (${type.name}) en SII Certificacion.`
        : `Consultando CAF DTE ${type.code} (${type.name}) en custodia local; no contacta al SII.`,
    );
  }

  if (command === 'emit') {
    const options = parseOptions(argv.slice(1));
    const type = requireDteType(options.type);
    assertAllowedOptions(options, ['type']);
    const service = type.code === 33 ? 'emit-factura33' : 'emit-boleta39';
    return commandResult(
      ['run', '--rm', service],
      `Emitiendo DTE ${type.code} (${type.name}) en SII Certificacion. Esta operacion consume un folio custodiado.`,
    );
  }

  if (command === 'retry') {
    if (!['validate', 'prepare', 'reconcile', 'send'].includes(actionOrOption)) {
      throw new Error(
        'Uso: sii:cert -- retry <validate|prepare|reconcile|send> --type=<33|39> --folio=<numero>',
      );
    }
    const options = parseOptions(tail);
    const type = requireDteType(options.type);
    const folio = parsePositiveInteger(options.folio, '--folio');
    const tenant = parseTenant(options.tenant);
    if (actionOrOption === 'prepare' && type.code !== 39) {
      throw new Error('retry prepare esta disponible solo para boleta DTE 39.');
    }
    assertAllowedOptions(options, ['type', 'folio', 'tenant']);
    const service = type.code === 33 ? 'emit-factura33' : 'emit-boleta39';
    const runArgs = ['run', '--rm'];
    if (actionOrOption === 'validate') runArgs.push('--no-deps');
    if (tenant) {
      runArgs.push(
        '-e',
        `${type.code === 33 ? 'REAL_SII_TEST_FACTURA33_TENANT_ID' : 'REAL_SII_TEST_TENANT_ID'}=${tenant}`,
      );
    }
    runArgs.push(
      service,
      'node',
      'scripts/real-sii/retry-folio.cjs',
      actionOrOption,
      String(type.code),
      String(folio),
    );
    return commandResult(
      runArgs,
      actionOrOption === 'validate'
        ? `Validando offline XSD, TED y XMLDSig del DTE ${type.code}, folio ${folio}.`
        : actionOrOption === 'prepare'
          ? `Regenerando y firmando DTE ${type.code}, folio ${folio}, sin upload. Requiere reconciliacion not_received.`
        : actionOrOption === 'reconcile'
          ? `Consultando en SII si DTE ${type.code}, folio ${folio}, fue recibido. No realiza upload.`
          : `Recuperando DTE ${type.code}, folio ${folio}, en SII Certificacion. No usar si el SII ya lo recibio.`,
    );
  }

  throw new Error(`Comando desconocido: ${command}`);
}

function commandResult(dockerArgs, message) {
  return { help: false, dockerArgs: [...COMPOSE_ARGS, ...dockerArgs], message };
}

function parseOptions(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith('--')) {
      throw new Error(`Argumento inesperado: ${arg}`);
    }

    const separator = arg.indexOf('=');
    if (separator > 2) {
      options[arg.slice(2, separator)] = arg.slice(separator + 1);
      continue;
    }

    const key = arg.slice(2);
    const value = args[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Falta valor para --${key}`);
    }
    options[key] = value;
    index += 1;
  }
  return options;
}

function requireDteType(value) {
  if (!value)
    throw new Error(
      'Falta --type. Valores admitidos: 33, 39, factura, boleta.',
    );
  const type = DTE_TYPES.get(String(value).trim().toLowerCase());
  if (!type) throw new Error(`Tipo DTE no soportado: ${value}. Use 33 o 39.`);
  return type;
}

function parseQuantity(value, action) {
  if (value === undefined) return undefined;
  if (action !== 'acquire') {
    throw new Error('--quantity solo aplica a caf acquire.');
  }
  const quantity = parsePositiveInteger(value, '--quantity');
  if (quantity > 50) throw new Error('--quantity no puede superar 50.');
  return quantity;
}

function parsePositiveInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} debe ser un entero positivo.`);
  }
  return parsed;
}

function parseTenant(value) {
  if (value === undefined) return undefined;
  const tenant = String(value).trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(tenant)) {
    throw new Error(
      '--tenant debe usar 1-64 caracteres alfanumericos, punto, guion o guion bajo.',
    );
  }
  return tenant;
}

function assertAllowedOptions(options, allowed) {
  const unexpected = Object.keys(options).filter(
    (key) => !allowed.includes(key),
  );
  if (unexpected.length > 0) {
    throw new Error(
      `Opciones no admitidas: ${unexpected.map((key) => `--${key}`).join(', ')}`,
    );
  }
}

function assertNoArguments(args, command) {
  if (args.length > 0) throw new Error(`${command} no admite argumentos.`);
}

function printHelp() {
  process.stdout.write(`Uso:
  pnpm.cmd run sii:cert -- caf acquire --type=<33|39> [--quantity=<1-50>]
  pnpm.cmd run sii:cert -- caf check --type=<33|39>
  pnpm.cmd run sii:cert -- emit --type=<33|39>
  pnpm.cmd run sii:cert -- custody test
  pnpm.cmd run sii:cert -- retry <validate|prepare|reconcile|send> --type=<33|39> --folio=<numero> [--tenant=<id>]
  pnpm.cmd run sii:cert -- down

Aliases de tipo: factura=33, boleta=39.
`);
}

function main() {
  let resolved;
  try {
    resolved = resolveCommand(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`[sii:cert] ${error.message}\n`);
    process.exit(2);
  }

  if (resolved.help) {
    printHelp();
    return;
  }

  process.stdout.write(`[sii:cert] ${resolved.message}\n`);
  const child = spawn('docker-compose', resolved.dockerArgs, {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
    shell: false,
  });

  child.on('error', (error) => {
    process.stderr.write(
      `[sii:cert] No se pudo ejecutar docker-compose: ${error.message}\n`,
    );
    process.exit(1);
  });
  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });
}

module.exports = { resolveCommand };

if (require.main === module) main();
