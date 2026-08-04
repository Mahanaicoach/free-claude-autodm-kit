/** Terminal output helpers. No dependencies, colour-safe when piped. */

const tty = process.stdout.isTTY && !process.env.NO_COLOR;
const wrap = (code) => (s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : String(s));

export const c = {
  bold: wrap(1),
  dim: wrap(2),
  red: wrap(31),
  green: wrap(32),
  yellow: wrap(33),
  blue: wrap(34),
  cyan: wrap(36),
};

export function heading(text) {
  console.log('\n' + c.bold(text));
  console.log(c.dim('─'.repeat(Math.min(text.length, 60))));
}

export const ok = (msg) => console.log(`${c.green('✓')} ${msg}`);
export const warn = (msg) => console.log(`${c.yellow('!')} ${msg}`);
export const fail = (msg) => console.log(`${c.red('✗')} ${msg}`);
export const info = (msg) => console.log(`  ${msg}`);
export const step = (n, msg) => console.log(`\n${c.cyan(`[${n}]`)} ${c.bold(msg)}`);

/** Left-aligned table. rows = array of arrays of strings. */
export function table(headers, rows) {
  if (rows.length === 0) {
    console.log(c.dim('  (nothing yet)'));
    return;
  }
  const all = [headers, ...rows];
  const widths = headers.map((_, i) =>
    Math.max(...all.map((r) => String(r[i] ?? '').length))
  );
  const line = (r, style = (s) => s) =>
    '  ' + r.map((cell, i) => style(String(cell ?? '').padEnd(widths[i]))).join('  ');
  console.log(line(headers, c.dim));
  for (const r of rows) console.log(line(r));
}

export function json(value) {
  console.log(JSON.stringify(value, null, 2));
}

/** Reads one line from stdin. Returns '' if stdin is not interactive. */
export async function ask(question, { fallback = '' } = {}) {
  if (!process.stdin.isTTY) return fallback;
  process.stdout.write(`${question} `);
  return new Promise((resolve) => {
    const onData = (chunk) => {
      process.stdin.pause();
      process.stdin.off('data', onData);
      resolve(String(chunk).trim() || fallback);
    };
    process.stdin.resume();
    process.stdin.once('data', onData);
  });
}

export async function confirm(question) {
  const answer = await ask(`${question} ${c.dim('[y/N]')}`, { fallback: 'n' });
  return /^y(es)?$/i.test(answer);
}

export function truncate(s, n) {
  const str = String(s ?? '');
  return str.length > n ? str.slice(0, n - 1) + '…' : str;
}
