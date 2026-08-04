/**
 * Offline checks. No API key, no network — these verify the guards that stop
 * you from shipping a broken automation. Run: npm test
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { validateAutomation, validateIceBreakers, lintAutomation, ValidationError, LIMITS } from '../lib/validate.mjs';
import { ROOT } from '../lib/config.mjs';

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.log(`  ✗ ${name}\n    ${err.message}`);
    process.exitCode = 1;
  }
}

const base = { profileId: 'p', accountId: 'a', name: 'T', dmMessage: 'Hi', keywords: ['GUIDE'] };
const throwsWith = (payload, pattern, opts) => {
  try {
    validateAutomation(payload, opts);
  } catch (err) {
    assert.ok(err instanceof ValidationError, 'expected a ValidationError');
    assert.match(err.problems.join(' '), pattern);
    return;
  }
  assert.fail('expected validation to fail');
};

console.log('\nvalidation');

test('a plain automation passes', () => {
  validateAutomation({ ...base });
});

test('buttons drop the DM cap to 640', () => {
  const long = 'x'.repeat(700);
  validateAutomation({ ...base, dmMessage: long }); // fine without buttons
  throwsWith(
    { ...base, dmMessage: long, buttons: [{ type: 'url', title: 'Go', url: 'https://a.co' }] },
    /over the 640 limit/
  );
});

test('button titles over 20 chars are caught', () => {
  throwsWith(
    { ...base, buttons: [{ type: 'url', title: 'This label is much too long', url: 'https://a.co' }] },
    /truncates past 20/
  );
});

test('more than 3 buttons is rejected', () => {
  const b = { type: 'url', title: 'Go', url: 'https://a.co' };
  throwsWith({ ...base, buttons: [b, b, b, b] }, /at most 3/);
});

test('url buttons need a real url', () => {
  throwsWith({ ...base, buttons: [{ type: 'url', title: 'Go' }] }, /url buttons need a url/);
  throwsWith({ ...base, buttons: [{ type: 'url', title: 'Go', url: 'example.com' }] }, /must start with http/);
});

test('postback buttons need a payload', () => {
  throwsWith({ ...base, buttons: [{ type: 'postback', title: 'Go' }] }, /need a payload/);
});

test('phone buttons are rejected on Instagram but fine on Facebook', () => {
  const payload = { ...base, buttons: [{ type: 'phone', title: 'Call', phone: '+1555' }] };
  throwsWith(payload, /Facebook-only/);
  validateAutomation(payload, { platform: 'facebook' });
});

test('story-reply triggers are rejected on Facebook', () => {
  const payload = { ...base, trigger: 'story_reply' };
  validateAutomation(payload); // Instagram: fine
  throwsWith(payload, /Instagram-only/, { platform: 'facebook' });
});

test('more than 5 variations is rejected', () => {
  throwsWith({ ...base, dmMessageVariations: ['a', 'b', 'c', 'd', 'e', 'f'] }, /max 5/);
});

test('a clickTag without link tracking is contradictory', () => {
  throwsWith({ ...base, clickTag: 'x', linkTracking: false }, /needs linkTracking on/);
});

test('an account-wide rule with no keywords is blocked by default', () => {
  throwsWith({ ...base, keywords: [] }, /every comment on every post/);
});

test('an empty-keyword rule scoped to one post is allowed', () => {
  validateAutomation({ ...base, keywords: [], platformPostId: '123' });
});

test('dmMessage is required', () => {
  throwsWith({ ...base, dmMessage: '   ' }, /dmMessage is required/);
});

test('every problem is reported at once, not one at a time', () => {
  try {
    validateAutomation({ ...base, dmMessage: '', matchMode: 'fuzzy', trigger: 'nope' });
    assert.fail('expected failure');
  } catch (err) {
    assert.equal(err.problems.length, 3);
  }
});

console.log('\nice breakers');

test('at most 4, questions at most 80 chars', () => {
  const ib = { question: 'What do you do?', payload: 'X' };
  validateIceBreakers([ib]);
  assert.throws(() => validateIceBreakers([ib, ib, ib, ib, ib]), ValidationError);
  assert.throws(() => validateIceBreakers([{ question: 'x'.repeat(81), payload: 'X' }]), ValidationError);
});

console.log('\nlint warnings');

test('a bare link with no button is flagged', () => {
  const warnings = lintAutomation({ ...base, dmMessage: 'Here https://a.co' });
  assert.ok(warnings.some((w) => /Message Requests folder/.test(w)));
});

test('short contains-keywords are flagged', () => {
  const warnings = lintAutomation({ ...base, keywords: ['a'], matchMode: 'contains' });
  assert.ok(warnings.some((w) => /match almost every comment/.test(w)));
});

console.log('\ntemplates');

for (const file of readdirSync(join(ROOT, 'templates')).filter((f) => f.endsWith('.json'))) {
  test(`${file} is valid`, () => {
    const t = JSON.parse(readFileSync(join(ROOT, 'templates', file), 'utf8'));
    assert.ok(t.name, 'needs a name');
    assert.ok(t._description, 'needs a _description for `autodm templates`');
    validateAutomation({ ...t, profileId: 'p', accountId: 'a', platformPostId: t.trigger ? undefined : 'x' });
  });
}

console.log(`\n${passed} checks passed${process.exitCode ? ' (with failures above)' : ''}\n`);
