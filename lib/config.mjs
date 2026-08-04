/**
 * Config loading. Two layers, both plain files, no dependencies:
 *
 *   .env               — secrets (ZERNIO_API_KEY). Never committed.
 *   autodm.config.json — the ids we resolved once (profileId, accountId).
 *                        Safe to commit, but gitignored by default anyway.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENV_PATH = join(ROOT, '.env');
const CONFIG_PATH = join(ROOT, 'autodm.config.json');

/** Reads .env into process.env without clobbering real environment vars. */
export function loadEnv() {
  if (!existsSync(ENV_PATH)) return;
  for (const line of readFileSync(ENV_PATH, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

export function readConfig() {
  if (!existsSync(CONFIG_PATH)) return {};
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return {};
  }
}

export function writeConfig(patch) {
  const next = { ...readConfig(), ...patch };
  writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2) + '\n');
  return next;
}

export function saveApiKey(key) {
  let lines = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf8').split('\n') : [];
  lines = lines.filter((l) => !l.trim().startsWith('ZERNIO_API_KEY='));
  lines = lines.filter((l, i) => !(l.trim() === '' && i === lines.length - 1));
  lines.push(`ZERNIO_API_KEY=${key}`);
  writeFileSync(ENV_PATH, lines.join('\n').replace(/\n+$/, '') + '\n', { mode: 0o600 });
}

export { ENV_PATH, CONFIG_PATH };
