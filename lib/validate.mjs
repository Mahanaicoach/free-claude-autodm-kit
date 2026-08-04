/**
 * Client-side guards for Meta's messaging limits.
 *
 * These are not our rules — they are Meta's, enforced by Zernio and by the
 * Instagram Graph API behind it. Checking here means you find out while you
 * are writing the DM, not after a commenter has already triggered it.
 */

export const LIMITS = {
  DM_WITH_BUTTONS: 640,   // button_template text cap
  DM_PLAIN: 1000,         // plain-text DM, approximate
  BUTTON_TITLE: 20,
  MAX_BUTTONS: 3,
  MAX_VARIATIONS: 5,
  MAX_QUICK_REPLIES: 13,
  ICE_BREAKER_QUESTION: 80,
  MAX_ICE_BREAKERS: 4,
  PRIVATE_REPLY_WINDOW_DAYS: 7,
};

export class ValidationError extends Error {
  constructor(problems) {
    super(problems.join('\n'));
    this.name = 'ValidationError';
    this.problems = problems;
  }
}

/**
 * Validates a comment-automation payload before it hits the API.
 * Returns the payload unchanged, or throws with every problem at once.
 */
export function validateAutomation(payload, { platform = 'instagram' } = {}) {
  const problems = [];
  const buttons = payload.buttons || [];
  const hasButtons = buttons.length > 0;
  const cap = hasButtons ? LIMITS.DM_WITH_BUTTONS : LIMITS.DM_PLAIN;

  if (!payload.dmMessage || !payload.dmMessage.trim()) {
    problems.push('dmMessage is required — that is the DM the commenter receives.');
  } else if (payload.dmMessage.length > cap) {
    problems.push(
      `dmMessage is ${payload.dmMessage.length} chars, over the ${cap} limit` +
        (hasButtons ? ' that applies once you attach buttons. Shorten it or drop the buttons.' : '.')
    );
  }

  if (buttons.length > LIMITS.MAX_BUTTONS) {
    problems.push(`${buttons.length} buttons — Meta allows at most ${LIMITS.MAX_BUTTONS}.`);
  }

  buttons.forEach((b, i) => {
    const at = `buttons[${i}]`;
    if (!b.title) problems.push(`${at}: title is required.`);
    else if (b.title.length > LIMITS.BUTTON_TITLE) {
      problems.push(
        `${at}: title "${b.title}" is ${b.title.length} chars — Meta truncates past ${LIMITS.BUTTON_TITLE}.`
      );
    }
    const type = b.type || 'url';
    if (!['url', 'postback', 'phone'].includes(type)) {
      problems.push(`${at}: type must be url, postback, or phone.`);
    }
    if (type === 'url' && !b.url) problems.push(`${at}: url buttons need a url.`);
    if (type === 'url' && b.url && !/^https?:\/\//.test(b.url)) {
      problems.push(`${at}: url must start with http:// or https://`);
    }
    if (type === 'postback' && !b.payload) problems.push(`${at}: postback buttons need a payload.`);
    if (type === 'phone') {
      if (!b.phone) problems.push(`${at}: phone buttons need a phone number.`);
      if (platform === 'instagram') {
        problems.push(`${at}: phone buttons are Facebook-only — they will not render on Instagram.`);
      }
    }
  });

  for (const field of ['dmMessageVariations', 'commentReplyVariations']) {
    const list = payload[field];
    if (!list) continue;
    if (list.length > LIMITS.MAX_VARIATIONS) {
      problems.push(`${field}: ${list.length} entries, max ${LIMITS.MAX_VARIATIONS}.`);
    }
    if (field === 'dmMessageVariations') {
      list.forEach((text, i) => {
        if (text.length > cap) {
          problems.push(`${field}[${i}] is ${text.length} chars, over the ${cap} limit.`);
        }
      });
    }
  }

  if (payload.matchMode && !['exact', 'contains'].includes(payload.matchMode)) {
    problems.push('matchMode must be "exact" or "contains".');
  }

  if (payload.trigger && !['comment', 'story_reply'].includes(payload.trigger)) {
    problems.push('trigger must be "comment" or "story_reply".');
  }
  if (payload.trigger === 'story_reply' && platform === 'facebook') {
    problems.push('Story-reply triggers are Instagram-only. On Facebook, use the comment trigger.');
  }

  if (payload.clickTag && payload.linkTracking === false) {
    problems.push('clickTag needs linkTracking on — a click cannot be tagged if it is not tracked.');
  }

  if (payload.keywords && payload.keywords.length === 0 && !payload.platformPostId) {
    problems.push(
      'Empty keywords on an account-wide automation means every comment on every post gets a DM. ' +
        'If that is really what you want, pass --any-comment to confirm.'
    );
  }

  if (problems.length) throw new ValidationError(problems);
  return payload;
}

export function validateIceBreakers(iceBreakers) {
  const problems = [];
  if (!Array.isArray(iceBreakers) || iceBreakers.length === 0) {
    problems.push('Give at least one ice breaker.');
  }
  if (iceBreakers.length > LIMITS.MAX_ICE_BREAKERS) {
    problems.push(`${iceBreakers.length} ice breakers — Instagram allows ${LIMITS.MAX_ICE_BREAKERS}.`);
  }
  iceBreakers.forEach((ib, i) => {
    if (!ib.question) problems.push(`ice_breakers[${i}]: question is required.`);
    else if (ib.question.length > LIMITS.ICE_BREAKER_QUESTION) {
      problems.push(
        `ice_breakers[${i}]: question is ${ib.question.length} chars, max ${LIMITS.ICE_BREAKER_QUESTION}.`
      );
    }
    if (!ib.payload) problems.push(`ice_breakers[${i}]: payload is required.`);
  });
  if (problems.length) throw new ValidationError(problems);
  return iceBreakers;
}

/** Warnings worth printing but not worth blocking on. */
export function lintAutomation(payload) {
  const warnings = [];
  const kw = payload.keywords || [];

  if (kw.some((k) => k.length <= 2)) {
    warnings.push(
      'A keyword of 1–2 characters with matchMode "contains" will match almost every comment. Use "exact" or a longer word.'
    );
  }
  if ((payload.matchMode || 'contains') === 'contains' && kw.some((k) => /^(a|i|the|it|ok)$/i.test(k))) {
    warnings.push('Common English words as "contains" keywords will fire constantly. Switch to exact match.');
  }
  if (!payload.commentReply) {
    warnings.push(
      'No commentReply set. A public "check your DMs" reply lifts the comment in the ranking and tells the commenter the DM is coming.'
    );
  }
  if (payload.buttons?.length && payload.dmMessage?.length > LIMITS.DM_WITH_BUTTONS * 0.9) {
    warnings.push('DM is close to the 640-char button cap — edits later may push it over.');
  }
  if (!payload.buttons?.length && /https?:\/\//.test(payload.dmMessage || '')) {
    warnings.push(
      'You put a bare link in the DM text. A button gets a higher tap rate and is the only thing that renders in the Message Requests folder for non-followers.'
    );
  }
  return warnings;
}
