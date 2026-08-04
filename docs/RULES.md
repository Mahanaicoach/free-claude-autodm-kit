# Staying on the right side of it

Short version: this system only ever replies to someone who contacted you first. That's
precisely why Meta allows it, and it's the line to not cross.

## Why this is allowed

Instagram's private-reply mechanism exists for exactly this: a person comments on your
post — a public, voluntary action — and you reply privately. Meta's own API supports it,
Zernio is a Meta Business Partner using the official Graph API, and no part of this logs
into your account or automates the app.

It is not:

- a bot that DMs people who never interacted with you
- a scraper
- a tool that logs into Instagram as you

Those get accounts restricted. This doesn't, because it isn't doing them.

## The guardrails already in the tool

**Deduplication.** Nobody gets DMed twice by the same automation. Built into Zernio, not
optional.

**Empty-keyword block.** An account-wide rule with no keywords DMs every commenter on every
post you have. The CLI refuses to create one unless you pass `--any-comment`, which exists
to make it a decision rather than an accident. Don't route around it.

**One private reply per comment, within 7 days.** Meta's limit, not ours.

## Things that will get you restricted

- Identical DMs at high volume with no variation. Use `--dm-variation` if you're sending
  a lot — that's what it's for.
- Sending to people who never commented. The `sequences` and `broadcasts` endpoints in
  `lib/zernio.mjs` can do this, which is exactly why the CLI doesn't wire them up.
- Links to anything Meta prohibits. A DM link is still subject to Meta's content policies.
- Keyword bait with no payoff. "Comment GUIDE" and then no guide is the fastest way to
  collect reports.

## Write DMs a person would want

The mechanical stuff matters less than this. A DM that reads like a funnel gets reported;
one that reads like a person gets replies.

- Reference what they commented on. They asked for a specific thing.
- Deliver immediately. The link goes in the first message, on a button, no email gate.
- Give them a way out. A second button or an honest "if this isn't it, tell me what you're
  after" costs nothing and changes the tone completely.
- Don't fake urgency in an automated message. Everyone can tell.

## Data

Everyone who triggers an automation lands in Zernio's contact CRM with their handle and any
tags you set. That's personal data. Zernio states SOC 2 and GDPR compliance, but the
obligations for what *you* do with the list are yours: don't export commenters into an
unrelated mailing list, and don't sell it.

## If something goes wrong

Pause everything first, then diagnose:

```bash
node bin/autodm.mjs list
node bin/autodm.mjs pause <id>
```

Pausing keeps your stats and logs. It's always the right first move — deleting destroys the
evidence you need to work out what happened.
