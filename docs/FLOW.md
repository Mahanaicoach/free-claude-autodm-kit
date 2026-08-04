# The complete flow

Everything this can do, in the order it makes sense to do it. Stages 1–4 are the whole
system working; 5 onward is making it better. Nobody needs all of it on day one.

Works identically on Instagram and Facebook — add `--platform facebook` for a Page. Setup
differs slightly: [INSTAGRAM.md](INSTAGRAM.md) · [FACEBOOK.md](FACEBOOK.md).

---

## What actually happens

```
  You post                          →  caption says "comment GUIDE"
        ↓
  Someone comments GUIDE            →  a public, voluntary action
        ↓
  Meta fires a webhook              →  no polling, no delay
        ↓
  Zernio matches your keyword       →  contains / exact
        ↓
  ├─ DM sent, with a button         →  1–3 seconds later
  ├─ Public reply posted            →  "Sent it to your DMs 📩"
  └─ Person added to your contacts  →  tagged, ready for follow-up
        ↓
  They tap the button               →  click counted, contact tagged
        ↓
  You see it in stats               →  triggered · sent · read · clicks · CTR
```

Nobody is ever DMed twice by the same automation. That's built in.

---

## Stage 1 — Get connected  *(once, ~10 min)*

| | |
|---|---|
| Zernio account | <https://zernio.com/signup> — free, no card |
| API key → `.env` | <https://zernio.com/dashboard/api-keys> |
| Connect the account | `node bin/autodm.mjs connect instagram` |
| Confirm | `node bin/autodm.mjs doctor` |

`doctor` is the command you come back to whenever anything is odd. It checks the key, the
connection, and every automation, and tells you the fix rather than the error.

Instagram must be **Business or Creator**. Facebook must be a **Page** you admin. Full
walkthroughs in the platform guides.

## Stage 2 — Your first rule  *(2 min)*

```bash
node bin/autodm.mjs posts                    # find the post id
node bin/autodm.mjs templates                # or start from a ready-made rule

node bin/autodm.mjs new \
  --name "Free guide" \
  --keyword GUIDE \
  --dm "Hey! Here's the guide 👇 No email needed." \
  --button "Get the guide|https://your-link.com" \
  --reply "Sent it to your DMs 📩" \
  --post <post id> \
  --dry-run
```

`--dry-run` shows it without creating it. Drop the flag to go live.

**Put the link on a button, not in the text.** DMs to non-followers land in Message
Requests, where a URL in the message body isn't tappable. [Why](BUTTONS.md).

## Stage 3 — The caption does half the work

The word in your caption must be the word in your automation. Say it twice — once in the
caption, once on screen or in the voiceover.

> Full breakdown is in the guide — comment **GUIDE** and I'll send it.

## Stage 4 — Test and watch

Comment your keyword from a **second account**. DM lands in 1–3 seconds.

```bash
node bin/autodm.mjs logs <id>       # every comment that triggered it
node bin/autodm.mjs stats           # triggered · sent · read · clicks · CTR
```

Your own account can't trigger your own automation, and nobody gets DMed twice — both look
like failures and aren't.

---

## Stage 5 — Make it convert better

**Rotate the wording** so repeat commenters don't get a photocopy. Up to 5, picked at
random per trigger:

```bash
node bin/autodm.mjs edit <id> --dm-variation "Version two 👇;;Version three 👇"
```

**Add a second button** — an out alongside the ask. Lowers the pressure, raises the taps:

```bash
--button "Get the guide|https://link.com;;I have a question|ASK_QUESTION"
```

**Tag the people who actually click**, so follow-up goes to the warm ones only:

```bash
--click-tag "downloaded-guide"
node bin/autodm.mjs contacts --tag downloaded-guide
```

**Tune the matching.** `contains` catches "guide please" and "GUIDE!!". `exact` requires the
whole comment to be the keyword — right for two-letter keywords like `ME` that would
otherwise match "awesome".

```bash
node bin/autodm.mjs edit <id> --match exact
```

**Pause instead of deleting** while you experiment. Pausing keeps the stats and logs;
deleting destroys them.

```bash
node bin/autodm.mjs pause <id>
node bin/autodm.mjs resume <id>
```

## Stage 6 — More than one rule

**Different keyword per post.** Scope each to its post with `--post`. One active per-post
rule per post — a second returns an error rather than quietly fighting the first.

**Account-wide safety nets.** Leave `--post` off and the rule fires on every post, forever,
including old ones. Stack as many as you like, each with its own keywords — they run
independently, and a per-post rule always wins on its own post.

```bash
node bin/autodm.mjs new --template catch-all --keyword LINK --dm "..." --button "..."
```

Keep account-wide keywords narrow. A rule with *no* keywords DMs everyone who comments
anything, anywhere — the CLI blocks that behind `--any-comment` on purpose.

**Story replies** *(Instagram only)*. Post a story saying "reply LINK", get the same
automation:

```bash
node bin/autodm.mjs new --story --keyword LINK --dm "Here you go 👇" --button "Open|https://link.com"
```

Add a story id after `--story` to scope it to one story; leave it bare to match any.

**Ice breakers** *(Instagram only)* — the tappable FAQ for people who open your DMs without
ever commenting. Up to 4, 80 characters each:

```bash
node bin/autodm.mjs icebreakers set --q "How much is it?|PRICING;;Do you take clients?|CLIENTS"
```

## Stage 7 — Let Claude read the comment section

The automation handles keywords. This handles everything the keyword missed.

```bash
node bin/autodm.mjs triage <postId>
```

Sorts every comment into question · buying signal · praise · spam · negative, drafts a
public reply for each, and flags who deserves a personal DM. **It posts nothing.**

```bash
node bin/autodm.mjs answer <postId>          # shows what it would post
node bin/autodm.mjs answer <postId> --send   # posts them
```

Spam, anything negative, and anything low-confidence are held back for you. That gate is
deliberate: a wrong auto-reply on a public post isn't recoverable by deleting it.

And to write the DM in the first place:

```bash
node bin/autodm.mjs write --offer "the 7-day content system" --link https://your-link.com --create
```

All three use your logged-in `claude` CLI if you have one, and keyword rules if you don't.
No API key either way.

## Stage 7b — Run the comment section by hand

```bash
node bin/autodm.mjs comments <postId>                          # read the thread
node bin/autodm.mjs reply <postId> --comment <id> --message "..."   # reply publicly
node bin/autodm.mjs hide <postId> <commentId>                  # hide a troll (--unhide to undo)
node bin/autodm.mjs dm <postId> <commentId> --message "..." --button "Label|https://..."
```

That last one is a **manual private reply** — DM one specific commenter by hand, buttons
included. Meta's limits are hard: **one per comment, within 7 days**. Fine for picking off
the good comments an automation didn't catch; not something to build a routine around.

## Stage 8 — Know who you're talking to

Everyone who triggers an automation is added to your contacts automatically, with any tags
you set.

```bash
node bin/autodm.mjs contacts                       # everyone
node bin/autodm.mjs contacts --tag downloaded-guide  # just the clickers
```

That list is the actual asset here. The DMs are how you build it.

## Stage 9 — Wire it into your own stuff  *(optional)*

If you run a server, push events to it instead of checking manually:

```bash
node bin/autodm.mjs webhook add --url https://your-server.com/hook \
  --events comment.received,message.received,account.disconnected
```

`account.disconnected` is the one worth having even if you ignore the rest — it's what
silently kills every automation you own when a Meta token expires.

Everything the CLI does is a REST call. `lib/zernio.mjs` has one method per endpoint if you
want to build something else on top. Full contract: [FEATURES.md](FEATURES.md).

---

## Every command

```
Setup       setup · doctor · connect [instagram|facebook] · accounts
Automations new · list · show · edit · pause · resume · rm · logs · stats · templates
Claude      write · triage · answer
Comments    posts · comments · reply · hide · dm
DM extras   icebreakers · contacts · webhook
```

`node bin/autodm.mjs help` for the flags. Every command takes `--json`, which is how Claude
drives it — you never have to type any of this if you'd rather just ask.

---

## What it won't do

- DM people who never contacted you. That's not what this is, and it's how accounts get
  restricted. The `sequences` and `broadcasts` endpoints exist in the client and are
  deliberately not wired up — see [RULES.md](RULES.md).
- Log into your account or scrape anything. It's Meta's official API throughout.
- Promise delivery on Instagram. Instagram sends no delivery receipt; `read` is the closest
  real signal, and `stats` labels it honestly.
