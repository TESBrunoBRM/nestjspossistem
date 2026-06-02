const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { loadEnvFileIntoProcess } = require('./env-file.cjs');

const envFile = process.argv[2] || '.env.ministack';
loadEnvFileIntoProcess(envFile);

const tmpDir = path.resolve(process.cwd(), '.ministack', 'tmp');
const stateDir = path.resolve(process.cwd(), '.ministack', 'state');

fs.mkdirSync(tmpDir, { recursive: true });
fs.mkdirSync(stateDir, { recursive: true });

const env = {
  ...process.env,
  TMPDIR: tmpDir,
  PERSIST_STATE: process.env.PERSIST_STATE || '1',
  STATE_DIR: process.env.STATE_DIR || stateDir,
  MINISTACK_REGION:
    process.env.MINISTACK_REGION || process.env.AWS_REGION || 'us-east-1',
};

console.log(`MiniStack usara TMPDIR=${tmpDir}`);
console.log(`MiniStack persistira estado en ${stateDir}`);

const child = spawn('python', ['-m', 'ministack'], {
  cwd: process.cwd(),
  env,
  stdio: 'inherit',
  shell: false,
});

child.on('error', (error) => {
  console.error('No se pudo iniciar MiniStack');
  console.error(error);
  process.exit(1);
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
