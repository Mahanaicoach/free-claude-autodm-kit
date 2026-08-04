/**
 * The thinking layer.
 *
 * Claude does the writing and the judgement calls — but this repo never asks for
 * an API key, and it must still work when nobody is logged in. So every task has
 * two implementations:
 *
 *   1. Claude, via the `claude -p` CLI on the user's existing subscription.
 *   2. A deterministic heuristic that is worse but always available.
 *
 * When Claude Code is the one running this repo, it does the reasoning itself and
 * never shells out — `--raw` gives it the structured input to think about. The
 * subprocess path is for people running the CLI by hand in a terminal.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

/** Is a logged-in `claude` CLI available? Cached — the probe costs a subprocess. */
let claudeAvailable = null;

export async function haveClaude() {
  if (claudeAvailable !== null) return claudeAvailable;
  if (process.env.AUTODM_NO_CLAUDE) return (claudeAvailable = false);
  try {
    await run('claude', ['--version'], { timeout: 8000 });
    claudeAvailable = true;
  } catch {
    claudeAvailable = false;
  }
  return claudeAvailable;
}

/**
 * Asks Claude for JSON. Returns null on any failure — a missing CLI, a logged-out
 * CLI ("Not logged in" is the common one), a timeout, or unparseable output.
 * Callers fall back rather than surfacing an error.
 */
async function askClaude(prompt, { timeout = 90000 } = {}) {
  if (!(await haveClaude())) return null;
  try {
    const { stdout } = await run('claude', ['-p', prompt], {
      timeout,
      maxBuffer: 1024 * 1024 * 8,
    });
    return parseLooseJson(stdout);
  } catch {
    return null;
  }
}

/** Models wrap JSON in prose or fences more often than they should. */
export function parseLooseJson(text) {
  if (!text) return null;
  const cleaned = String(text).replace(/```(?:json)?/gi, '');
  const start = cleaned.search(/[[{]/);
  if (start === -1) return null;
  const opener = cleaned[start];
  const closer = opener === '{' ? '}' : ']';
  const end = cleaned.lastIndexOf(closer);
  if (end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

// ── Task 1: write the DM ──────────────────────────────────────────────────

const WRITE_PROMPT = ({ offer, link, caption, platform, keyword }) => `
You are writing an Instagram/Facebook auto-DM that fires when someone comments a keyword.

Offer: ${offer}
Link: ${link}
Keyword they comment: ${keyword}
Platform: ${platform}
${caption ? `The post caption: ${caption}` : ''}

Rules, all of them hard:
- The DM must be under 600 characters. It carries a button, which caps it at 640.
- Open like a person messaging a person. Never "Thanks for your interest in our offer!"
- Do NOT put the link in the DM text. It goes on the button. In Instagram's Message
  Requests folder, where DMs from non-followers land, a URL in the body is not tappable.
- The button label must be under 20 characters and say what happens: "Get the guide",
  "Pick a time". Never "Click here" or "Learn more".
- The public comment reply is short, 2-5 words, and tells them a DM is coming.
- Reply variations must be genuinely different wordings, not synonyms of each other.
- No fake urgency, no fake scarcity, no invented claims about the offer.

Return ONLY this JSON, no other text:
{
  "dm": "the DM text",
  "buttonLabel": "under 20 chars",
  "commentReply": "short public reply",
  "replyVariations": ["alt 1", "alt 2", "alt 3"],
  "dmVariations": ["a genuinely different second version of the DM"],
  "note": "one sentence on the choice you made"
}`;

/**
 * Fits a button label into Meta's 20 characters without cutting a word in half.
 * "Get the pricing guide" → "Get the pricing", not "Get the pricing guid".
 */
function fitLabel(thing) {
  const full = `Get the ${thing}`;
  if (full.length <= LIMITS_BUTTON_TITLE) return full;
  const words = full.split(/\s+/);
  let label = '';
  for (const word of words) {
    const next = label ? `${label} ${word}` : word;
    if (next.length > LIMITS_BUTTON_TITLE) break;
    label = next;
  }
  return label.length >= 6 ? label : 'Get it';
}

const LIMITS_BUTTON_TITLE = 20;

/** Heuristic DM copy. Plain, safe, and obviously a starting point. */
function writeDmHeuristic({ offer, keyword }) {
  const thing = String(offer || 'it').replace(/^(the|a|an)\s+/i, '');
  return {
    dm:
      `Hey! Here's the ${thing} I mentioned 👇\n\n` +
      `Tap below and it's yours — no email, no signup. If it's not what you were after, ` +
      `just reply and tell me what you're working on.`,
    buttonLabel: fitLabel(thing),
    commentReply: 'Sent it to your DMs 📩',
    replyVariations: ['Just DMed you 📩', "Check your DMs — it's in there 👀", 'On its way 📩'],
    dmVariations: [
      `That's in your DMs now 👇\n\nOne tap, no email needed. Tell me if it's not the ${thing} you meant.`,
    ],
    note: `Written from a template — a logged-in \`claude\` CLI would tailor this to your post. Keyword: ${keyword}.`,
    source: 'heuristic',
  };
}

export async function writeDm(input) {
  const result = await askClaude(WRITE_PROMPT(input));
  if (!result?.dm || !result?.buttonLabel) return writeDmHeuristic(input);

  // Models overshoot these limits often enough to be worth clamping rather than
  // failing validation two steps later, where the cause is much less obvious.
  return {
    ...result,
    dm: String(result.dm).slice(0, 640),
    buttonLabel: fitLabel(String(result.buttonLabel).replace(/^Get the /i, '')),
    replyVariations: (result.replyVariations || []).slice(0, 5),
    dmVariations: (result.dmVariations || []).slice(0, 5).map((v) => String(v).slice(0, 640)),
    source: 'claude',
  };
}

// ── Task 2: triage the comments ───────────────────────────────────────────

export const CATEGORIES = ['question', 'buying-signal', 'praise', 'spam', 'negative', 'other'];

const TRIAGE_PROMPT = ({ comments, context, handle }) => `
You are triaging comments on a social post for the account owner${handle ? ` (${handle})` : ''}.
${context ? `Context about the post: ${context}` : ''}

For each comment, decide:
- category: one of ${CATEGORIES.join(', ')}
- reply: a public reply in the owner's voice, under 120 characters, or "" if it needs none
- dmWorthy: true only if this person is asking something that deserves a private answer
- confidence: 0-1

Rules:
- Praise gets a short warm reply, not a pitch.
- A question gets an actual answer if you can give one from the context; otherwise say you
  will follow up, and never invent a fact about their business, price, or timeline.
- Spam and bot comments get reply "" and dmWorthy false.
- A negative or angry comment gets reply "" — the owner handles those personally. Never
  draft a defensive reply.
- Never promise anything on the owner's behalf.

Comments:
${comments.map((c, i) => `${i}. @${c.from?.username || c.from?.name || 'someone'}: ${c.message}`).join('\n')}

Return ONLY a JSON array, one object per comment, in the same order:
[{"index":0,"category":"...","reply":"...","dmWorthy":false,"confidence":0.8}]`;

// Note the non-capturing groups: the backreference in the repeated-character rule
// must point at `(.)`, and any capturing group before it silently steals the number.
const PATTERNS = {
  spam: /\b(?:follow ?back|f4f|check my (?:page|profile|bio)|dm me for|promo|cheap followers|crypto|investment|whatsapp \+)\b|(.)\1{6,}/i,
  buying: /\b(?:price|pricing|cost|how much|hbu|quote|book|hire|available|work with|sign ?up|buy|purchase)\b/i,
  negative: /\b(?:scam|fake|garbage|useless|waste of|ripoff|rip off|misleading|liar|report(?:ed|ing)? you)\b/i,
  praise: /\b(?:love|great|amazing|awesome|helpful|thank you|thanks|goat|fire|needed this|underrated)\b|[🔥❤️👏🙌💯😍]/iu,
};

/** Keyword triage. Deliberately conservative: when unsure, it drafts nothing. */
function triageHeuristic(comments) {
  return comments.map((c, index) => {
    const text = String(c.message || '');
    let category = 'other';
    let reply = '';
    let dmWorthy = false;

    if (PATTERNS.spam.test(text)) category = 'spam';
    else if (PATTERNS.negative.test(text)) category = 'negative';
    else if (PATTERNS.buying.test(text)) {
      category = 'buying-signal';
      reply = 'Just sent you the details 📩';
      dmWorthy = true;
    } else if (/\?\s*$|^(how|what|when|where|why|which|can|does|do|is|are)\b/i.test(text.trim())) {
      category = 'question';
      dmWorthy = true;
    } else if (PATTERNS.praise.test(text)) {
      category = 'praise';
      reply = 'Appreciate you 🙏';
    }

    return { index, category, reply, dmWorthy, confidence: 0.4, source: 'heuristic' };
  });
}

export async function triage({ comments, context, handle }) {
  if (comments.length === 0) return [];
  const result = await askClaude(TRIAGE_PROMPT({ comments, context, handle }));

  if (Array.isArray(result) && result.length) {
    const byIndex = new Map(result.map((r) => [Number(r.index), r]));
    return comments.map((_, index) => {
      const r = byIndex.get(index);
      if (!r) return { index, category: 'other', reply: '', dmWorthy: false, confidence: 0, source: 'claude' };
      return {
        index,
        category: CATEGORIES.includes(r.category) ? r.category : 'other',
        reply: typeof r.reply === 'string' ? r.reply.slice(0, 200) : '',
        dmWorthy: Boolean(r.dmWorthy),
        confidence: Number(r.confidence) || 0,
        source: 'claude',
      };
    });
  }
  return triageHeuristic(comments);
}

/**
 * Comments this tool will never auto-reply to, no matter what the model said.
 * A wrong auto-reply on a public post is not recoverable by deleting it.
 */
export function isAutoReplySafe(verdict) {
  if (!verdict.reply) return false;
  if (verdict.category === 'negative' || verdict.category === 'spam') return false;
  if (verdict.source === 'heuristic') return verdict.category === 'praise';
  return verdict.confidence >= 0.7;
}
