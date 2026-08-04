---
name: autodm
description: "Use when the user wants to set up, change, debug, or check on Instagram or Facebook comment-to-DM automation in this repo — creating a keyword rule, writing the DM, adding buttons, connecting an Instagram account or Facebook Page, getting a Zernio API key, reading stats, or fixing a rule that is not firing. Also covers public comment replies, comment moderation, story-reply triggers, and Instagram ice breakers."
---

# Instagram & Facebook AutoDM

You are setting up a comment→DM system for someone who probably found this repo through
an Instagram post. Run the commands yourself. Explain in plain language. Never make them
read a flag reference.

## Always start here

```bash
node bin/autodm.mjs doctor --json
```

Its `findings` array tells you the next move. Work top-down: no key → key. No Instagram →
connect. No automation → create one. Do not skip ahead; each step depends on the last.

---

## Step 1 — Zernio account and API key

Zernio is the backend that talks to Instagram. Two accounts are free with no card, which
covers one Instagram account with room to spare.

Ask which they want:

**A. They do it (30 seconds, default)**

1. <https://zernio.com/signup> — sign up
2. <https://zernio.com/dashboard/api-keys> — "Create key", name it `autodm`
3. Copy the key (it is shown **once**) and paste it into `.env` as `ZERNIO_API_KEY=sk_...`

Then run `doctor --json` to confirm.

**B. You drive the browser (Claude in Chrome)**

If the Chrome extension tools are available, open the pages and narrate each screen.
Hard boundaries, no exceptions:

- **They** type the email and password. You do not create accounts or enter credentials.
- **They** copy the API key out of the dashboard and paste it into `.env`. You do not read
  it back, echo it, or write it anywhere else.
- You handle navigation, clicking "Create key", and pointing at the right button.

Say this out loud rather than silently stopping — otherwise it looks like the tool broke.

Write the key with the CLI's own helper if they hand it to you in chat:

```bash
node bin/autodm.mjs setup
```

---

## Step 2 — Connect Instagram, a Facebook Page, or both

Ask which they want. Default to Instagram unless they say otherwise. Both are free — two
connected accounts are included, so running both costs nothing.

```bash
node bin/autodm.mjs connect instagram --json
node bin/autodm.mjs connect facebook --json
```

Give them the `authUrl`. Before they click, tell them the two things that matter:

**Instagram** — the account must be **Business or Creator**. Personal accounts cannot use
the API at all, and no error later will make that obvious; the automation just never fires.
Switching is free, in Instagram → Settings → Account type and tools.

**Facebook** — automation runs on a **Page**, never a personal profile, and they need admin
or editor access to it. Meta asks them to pick which Page.

**Both** — approve *every* permission. Comments and messages are what the automation runs
on. Declining either produces a rule that installs cleanly and silently never works. This
is the most common setup failure on both platforms.

They complete the consent screen themselves. When they say they are back: `doctor --json`.

Detailed walkthroughs, if they want to read rather than be walked: `docs/INSTAGRAM.md`,
`docs/FACEBOOK.md`.

---

## Step 3 — The first automation

Ask three things, in this order. Do not ask for anything else.

1. **What are you giving away?** (guide, price list, booking link, waitlist)
2. **What word should people comment?** One word, ideally in caps — `GUIDE`, `PRICE`, `ME`
3. **Where does the link go?**

Then pick the closest template (`node bin/autodm.mjs templates --json`) and create it.
Show them the DM first:

```bash
node bin/autodm.mjs new --template lead-magnet \
  --name "Free guide" \
  --keyword GUIDE \
  --dm "Hey! Here's the guide 👇 It's the exact thing I use — no email needed." \
  --button "Get the guide|https://their-link.com" \
  --reply "Sent it to your DMs 📩" \
  --post <platformPostId> \
  --dry-run --json
```

Read the `warnings` array back to them in your own words, then re-run without `--dry-run`.

### Scoping: one post or every post

- `--post <id>` — fires only on that post. **This is the right default.** Get the id from
  `node bin/autodm.mjs posts --json`.
- No `--post` — account-wide, fires on every post on the account. You can stack several,
  each with its own keywords, and they run independently. Per-post rules win on their post.

Only one active per-post automation per post. A second returns 409 — edit the existing one.

### Buttons, not links in text

Default to a button. In Instagram's Message Requests folder — where DMs from people who
don't follow them land — a link in the message body does not render as tappable. A button
does. This is the single biggest difference between a rule that converts and one that
doesn't.

```
--button "Get the guide|https://link.com"
--button "Get it|https://link.com;;Book a call|https://cal.com"
```

Up to 3. Titles cap at 20 characters. Attaching any button drops the DM text limit from
~1000 to 640 — the CLI catches this before the API does.

---

## Step 4 — Show them it works

```bash
node bin/autodm.mjs logs <id> --json    # every comment that triggered it
node bin/autodm.mjs stats --json        # triggered / sent / read / clicks / CTR
```

Tell them to comment the keyword on their own post from a second account. The DM lands in
1–3 seconds. Their own account commenting on their own post will not trigger it.

---

## Instagram vs Facebook

Every command takes `--platform facebook`; Instagram is the default. The differences worth
knowing before you promise someone something:

| | Instagram | Facebook |
|---|---|---|
| Comment → DM, buttons, variations, tracking | ✅ | ✅ |
| Story-reply triggers (`--story`) | ✅ | ❌ |
| Ice breakers | ✅ | ❌ |
| Phone / Call buttons | ❌ | ✅ |
| Like a comment | ❌ | ✅ |
| `delivered` in stats | ❌ (no receipt exists) | ✅ |

The CLI enforces these — a phone button on Instagram or `--story` on Facebook is rejected
before it reaches the API, so you do not have to remember the table.

Facebook tokens expire noticeably more often. If a Facebook user says it "just stopped",
check `doctor --json` for a disconnected account before anything else.

`docs/FLOW.md` is the full stage-by-stage journey if they ask what else they can do.

## The rest of the surface

Reach for these when asked; don't volunteer all of them at once.

| They want | Command |
|---|---|
| Reply to a story instead of a comment | `new --story` (add a story id to scope it) |
| Rotate wording so repeat commenters see variety | `--dm-variation "a;;b"` (max 5) |
| Tag people who actually click | `--click-tag "downloaded-guide"` |
| See who triggered anything | `contacts --json` |
| Read a post's comment thread | `comments <postId> --json` |
| Reply publicly to one comment | `reply <postId> --comment <id> --message "..."` |
| Hide a troll | `hide <postId> <commentId>` |
| DM one specific commenter by hand | `dm <postId> <commentId> --message "..."` |
| FAQ buttons on their DM screen | `icebreakers set --q "How much?\|PRICING"` |
| Pause without losing stats | `pause <id>` |
| Push events to their own server | `webhook add --url https://...` |

`dm` (private reply) has hard Meta limits: one per comment, within 7 days. Say so before
they plan a workflow around it.

---

## When it isn't firing

Check in this order — it is almost always the first three:

1. `doctor --json` — is the account still connected? Tokens expire.
2. `show <id> --json` — is `isActive` true? Do the keywords match what the caption
   actually tells people to type?
3. `matchMode`. `contains` on a short word matches half the comments; `exact` on `GUIDE`
   misses `guide please`. Default to `contains` with a distinctive word.
4. `logs <id> --status failed --json` — if triggers are landing but sends fail, the error
   is in there. Usually a revoked message permission → reconnect.
5. Dedup: Zernio will not DM the same person twice for the same automation. Testing with
   the same account twice looks like a broken rule and isn't.

Full list with symptoms in `docs/TROUBLESHOOTING.md`.

---

## Say no to these

If asked to build any of them, explain why rather than quietly complying:

- Mass-DMing people who never commented. Not what this is; it is how accounts get limited.
- Removing the empty-keyword guard so every commenter on every post is DMed.
- Scraping commenters into an external list without telling them.

Meta's rules for this are in `docs/RULES.md`. The automation only ever replies to someone
who contacted them first — that is exactly why it is allowed.
