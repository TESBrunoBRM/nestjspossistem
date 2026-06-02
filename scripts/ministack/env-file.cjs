const fs = require('fs');
const path = require('path');

function resolveEnvFile(envFile = '.env.ministack') {
  return path.resolve(process.cwd(), envFile);
}

function parseEnvFile(envFile = '.env.ministack') {
  const resolved = resolveEnvFile(envFile);
  if (!fs.existsSync(resolved)) {
    throw new Error(`No existe archivo de entorno: ${resolved}`);
  }

  const lines = fs.readFileSync(resolved, 'utf8').split(/\r?\n/);
  const values = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    if (!key) continue;

    let value = trimmed.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

function loadEnvFileIntoProcess(envFile = '.env.ministack') {
  const values = parseEnvFile(envFile);
  for (const [key, value] of Object.entries(values)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
  return values;
}

module.exports = {
  loadEnvFileIntoProcess,
  parseEnvFile,
  resolveEnvFile,
};
