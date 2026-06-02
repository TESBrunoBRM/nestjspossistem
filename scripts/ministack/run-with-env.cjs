const { spawn } = require('child_process');
const { loadEnvFileIntoProcess, resolveEnvFile } = require('./env-file.cjs');

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error(
    'Uso: node scripts/ministack/run-with-env.cjs <archivo-env> <comando> [args...]',
  );
  process.exit(1);
}

const [envFile, command, ...commandArgs] = args;
const resolvedEnvFile = resolveEnvFile(envFile);
loadEnvFileIntoProcess(envFile);

const child = spawn(command, commandArgs, {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

child.on('exit', (code, signal) => {
  if (signal) {
    console.error(
      `Proceso detenido por senal ${signal} usando ${resolvedEnvFile}`,
    );
    process.exit(1);
  }
  process.exit(code ?? 0);
});

