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
const pending = [];

function test(name, fn) {
  const record = (err) => {
    if (err) {
      console.log(`  ✗ ${name}\n    ${err.message}`);
      process.exitCode = 1;
    } else {
      passed++;
      console.log(`  ✓ ${name}`);
    }
  };
  try {
    const result = fn();
    if (result instanceof Promise) {
      pending.push(result.then(() => record(), record));
    } else {
      record();
    }
  } catch (err) {
    record(err);
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

console.log('\nthe Claude layer (fallback path)');

// Force the heuristic path so these run without a logged-in `claude` CLI.
process.env.AUTODM_NO_CLAUDE = '1';
const { writeDm, triage, isAutoReplySafe, parseLooseJson } = await import('../lib/brain.mjs');

test('loose JSON survives fences and surrounding prose', () => {
  assert.deepEqual(parseLooseJson('Sure!\n```json\n{"a":1}\n```\nHope that helps'), { a: 1 });
  assert.deepEqual(parseLooseJson('[{"index":0}]'), [{ index: 0 }]);
  assert.equal(parseLooseJson('no json here'), null);
  assert.equal(parseLooseJson(''), null);
});

test('the fallback writes a usable, valid automation', async () => {
  const draft = await writeDm({ offer: 'the pricing guide', link: 'https://x.co', keyword: 'PRICE' });
  assert.equal(draft.source, 'heuristic');
  validateAutomation({
    profileId: 'p', accountId: 'a', name: 'T',
    dmMessage: draft.dm, keywords: ['PRICE'],
    buttons: [{ type: 'url', title: draft.buttonLabel, url: 'https://x.co' }],
    commentReply: draft.commentReply,
    commentReplyVariations: draft.replyVariations,
    dmMessageVariations: draft.dmVariations,
  });
});

test('button labels are cut at a word, never mid-word', async () => {
  for (const offer of ['the 7-day content system', 'the pricing guide', 'x', 'the thing']) {
    const { buttonLabel } = await writeDm({ offer, link: 'https://x.co', keyword: 'K' });
    assert.ok(buttonLabel.length <= 20, `"${buttonLabel}" is ${buttonLabel.length} chars`);
    assert.ok(buttonLabel.length >= 6, `"${buttonLabel}" is too short to read`);
    assert.ok(!/\s$/.test(buttonLabel), `"${buttonLabel}" ends in a space`);
    if (offer.startsWith('the ') && buttonLabel !== 'Get it') {
      assert.ok(offer.includes(buttonLabel.replace('Get the ', '')), `"${buttonLabel}" cut a word`);
    }
  }
});

test('the fallback triage reads the obvious cases', async () => {
  const comments = [
    { message: 'how much is it?', from: { username: 'a' } },
    { message: 'this is amazing 🔥', from: { username: 'b' } },
    { message: 'follow back check my page', from: { username: 'c' } },
    { message: 'total scam, reported you', from: { username: 'd' } },
    { message: 'ok', from: { username: 'e' } },
  ];
  const [buying, praise, spam, negative, other] = await triage({ comments });
  assert.equal(buying.category, 'buying-signal');
  assert.equal(praise.category, 'praise');
  assert.equal(spam.category, 'spam');
  assert.equal(negative.category, 'negative');
  assert.equal(other.category, 'other');
});

test('auto-reply refuses spam, negativity, and low confidence', () => {
  assert.equal(isAutoReplySafe({ category: 'negative', reply: 'hi', source: 'claude', confidence: 1 }), false);
  assert.equal(isAutoReplySafe({ category: 'spam', reply: 'hi', source: 'claude', confidence: 1 }), false);
  assert.equal(isAutoReplySafe({ category: 'question', reply: 'hi', source: 'claude', confidence: 0.5 }), false);
  assert.equal(isAutoReplySafe({ category: 'question', reply: '', source: 'claude', confidence: 1 }), false);
  assert.equal(isAutoReplySafe({ category: 'question', reply: 'hi', source: 'claude', confidence: 0.9 }), true);
});

test('the keyword fallback only ever auto-replies to praise', () => {
  assert.equal(isAutoReplySafe({ category: 'praise', reply: 'thanks', source: 'heuristic', confidence: 0.4 }), true);
  assert.equal(isAutoReplySafe({ category: 'buying-signal', reply: 'sent', source: 'heuristic', confidence: 0.4 }), false);
  assert.equal(isAutoReplySafe({ category: 'question', reply: 'x', source: 'heuristic', confidence: 0.4 }), false);
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

await Promise.all(pending);

console.log(`\n${passed} checks passed${process.exitCode ? ' (with failures above)' : ''}\n`);
