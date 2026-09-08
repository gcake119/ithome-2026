import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function isDirectExecution(importMetaUrl, argvPath) {
  if (typeof argvPath !== 'string') return false;
  const modulePath = fileURLToPath(importMetaUrl);
  const invokedPath = resolve(argvPath);
  if (modulePath === invokedPath) return true;
  try {
    return realpathSync(modulePath) === realpathSync(invokedPath);
  } catch {
    return false;
  }
}
