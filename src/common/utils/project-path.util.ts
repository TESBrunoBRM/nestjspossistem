import { isAbsolute, resolve } from 'path';

const PROJECT_ROOT = resolve(__dirname, '..', '..', '..');

export function resolveProjectPath(filePath: string): string {
  return isAbsolute(filePath) ? filePath : resolve(PROJECT_ROOT, filePath);
}