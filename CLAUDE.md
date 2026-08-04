# CLAUDE.md

Read this before doing anything in this repo.

## What this is

A command line for Instagram and Facebook comment→DM automation, running on the Zernio API.
Someone comments a keyword on a post, they get a DM — optionally with real tappable
buttons rather than a bare link.

Instagram is the default. `--platform facebook` targets a Page. The differences are
enforced in `lib/validate.mjs`, so you do not have to remember them: story-reply triggers
and ice breakers are Instagram-only, phone (Call) buttons are Facebook-only.

The person who cloned this repo is **probably not a developer**. They came from an
Instagram post. Your job is to run the commands for them and explain results in plain
language. Do not hand them a wall of flags and walk away.

## The rule that matters most

**You run the CLI. They never have to.**

Every command takes `--json` — use it, parse the result, and tell them what happened in
one or two sentences. Only show a raw command when they ask to see it or want to learn.

```bash
node bin/autodm.mjs doctor --json
```

## Order of operations

1. `doctor --json` — always start here. It tells you exactly what is missing.
2. If there is no API key → walk the signup flow in `docs/SETUP.md`.
3. If Instagram is not connected → `connect instagram --json`, give them the URL.
4. Only then create automations.

Never skip straight to creating an automation. It will fail confusingly.

## Things you must not do

- **Never create their Zernio account, enter their password, or complete Meta's OAuth
  consent for them**, even with the Chrome extension, even if they ask. Those are theirs
  to click. Navigate them there, explain the screen, wait.
- **Never print their API key back to them** or paste it into anything other than `.env`.
  It is gitignored for a reason.
- **Never create an account-wide automation with empty keywords** without saying out loud
  what it does: every commenter on every post gets a DM. The CLI blocks this unless
  `--any-comment` is passed. That block is a feature — do not route around it silently.
- **Never invent Zernio fields.** The full contract is in `docs/FEATURES.md`, derived from
  Zernio's OpenAPI spec. If something you need is not there, check
  <https://zernio.com/openapi.yaml> rather than guessing.
- **Never promise delivery.** Instagram sends no delivery receipt. `read` is the closest
  signal there is, and `stats` labels it honestly.

## Writing the DM for them

They will usually ask you to write it. Good DMs from this system:

- Open like a person, not a funnel. No "Thanks for your interest in our offer!"
- Put the link on a **button**, not in the text. Buttons are the only thing that renders
  in Instagram's Message Requests folder, which is where DMs from non-followers land.
  A link buried in text there is invisible.
- Stay under 640 characters once a button is attached. The CLI enforces this.
- Set a `commentReply` too. The public "check your DMs" reply is what tells everyone else
  scrolling the comments that the thing is real.

Use `--dry-run --json` to show them the DM before it goes live.

## Layout

```
bin/autodm.mjs      the CLI — every command lives here
lib/zernio.mjs      thin REST client, one method per endpoint
lib/validate.mjs    Meta's limits, enforced before the API call
templates/*.json    ready-made automations (`autodm templates`)
docs/INSTAGRAM.md   step-by-step setup, Instagram
docs/FACEBOOK.md    step-by-step setup, Facebook Pages
docs/FLOW.md        the whole journey, stage by stage — send people here for "what else can I do"
docs/               plus FEATURES, BUTTONS, TROUBLESHOOTING, PRICING, RULES, SETUP
test/smoke.mjs      offline checks — `npm test`, no key needed
```

## Verifying a change

`npm test` runs offline and covers the validation guards. There is no integration suite —
anything touching the API has to be checked against a real account. If you change
`lib/zernio.mjs`, re-read the relevant section of Zernio's OpenAPI spec first.
