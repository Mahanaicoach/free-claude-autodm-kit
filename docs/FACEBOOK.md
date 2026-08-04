# Facebook — the whole thing, step by step

Same system, same commands, one flag: `--platform facebook`. If you've already done
[INSTAGRAM.md](INSTAGRAM.md), steps 1–3 are done — skip to step 4.

Or open the repo in Claude and say **"set up my auto DM for Facebook"**.

---

## Step 0 — You need a Page, not a profile

**Facebook's API works on Pages only.** Your personal Facebook profile cannot be automated,
by anyone, ever. This isn't a Zernio limitation — Meta doesn't expose personal profiles.

You need:

- A **Facebook Page** (free to create)
- **Admin or Editor** access to it

Don't have one? facebook.com → Menu → **Pages** → **Create new Page**. Name it, pick a
category, done — about a minute.

**How to check your access:** open your Page → **Settings** → **Page access**. You should
be listed with full control or editor access. If you're only a "moderator", ask whoever
owns the Page to upgrade you, or the connection will fail at the permissions step.

---

## Step 1 — Check Node

```bash
node --version
```

**You should see:** `v18.x.x` or higher. If it errors, install from
[nodejs.org](https://nodejs.org).

---

## Step 2 — Create a Zernio account

1. **<https://zernio.com/signup>** — email or Google, no card

**You should see:** the Zernio dashboard.

First **2 connected accounts free, permanently**. A Facebook Page counts as one.
[PRICING.md](PRICING.md).

---

## Step 3 — Create an API key

1. **<https://zernio.com/dashboard/api-keys>** → **Create key** → name it `autodm`
2. **Copy it now** — shown once only

```bash
cp .env.example .env
```

Open `.env`, replace `sk_your_key_here` with your key, save. It's gitignored. Never paste it
anywhere public.

**Check it:**

```bash
node bin/autodm.mjs doctor
```

**You should see:** `✓ API key valid`.

---

## Step 4 — Connect your Page

```bash
node bin/autodm.mjs connect facebook
```

**You should see:** a `https://www.facebook.com/...` URL.

Open it in a browser logged into the Facebook account that manages the Page. Then:

1. **Log in** if asked
2. **Choose which Pages to give access to** — Meta shows a list. Pick the Page you want to
   automate. If you pick "Opt in to all", that's fine too.
3. **The permissions screen** — leave everything on

The four that matter:

| Permission | Why |
|---|---|
| `pages_manage_engagement` | Reading and replying to comments |
| `pages_messaging` | Sending the DM |
| `pages_read_engagement` | Seeing which post a comment is on |
| `pages_manage_posts` | Post data |

**Turning off engagement or messaging produces an automation that installs cleanly and then
never fires.** No warning appears. This is the most common failure on Facebook too.

4. Approve. Zernio will show you the Pages it found — **pick the one to connect**.

**Check it:**

```bash
node bin/autodm.mjs doctor
```

**You should see:** `✓ Facebook Page connected: Your Page Name`

> **Facebook tokens expire more often than Instagram's.** When one does, every automation
> on that Page goes quiet with no error. Run `doctor` if things go silent, and re-run
> `connect facebook` to fix it. If you run your own server, subscribe to the
> `account.disconnected` webhook — `node bin/autodm.mjs webhook add --url https://...
> --events account.disconnected` — and you'll be told instead of finding out from a drop
> in DMs.

---

## Step 5 — Make Facebook the default (optional)

If Facebook is the only thing you're automating, set it once instead of passing the flag
every time:

```bash
node bin/autodm.mjs setup --platform facebook
```

That writes it into `autodm.config.json`. Otherwise, add `--platform facebook` to any
command below.

---

## Step 6 — Find the post

```bash
node bin/autodm.mjs posts --platform facebook
```

**You should see:** a table of your Page's recent posts with comment counts. Copy the post
id from the first column.

---

## Step 7 — Create the automation

```bash
node bin/autodm.mjs new --platform facebook \
  --name "Price list" \
  --keyword PRICE \
  --dm "Happy to share 👋 Full breakdown below — packages, what's included, turnaround." \
  --button "See pricing|https://your-link.com" \
  --reply "Just sent you the details 📩" \
  --post <the post id> \
  --dry-run
```

Read the preview, then re-run without `--dry-run`.

**You should see:** `✓ "Price list" · id abc123` and `Platform: facebook`.

---

## Step 8 — The Facebook-only trick: Call buttons

Facebook supports a **phone button** that dials when tapped. Instagram doesn't — this is the
one thing Facebook does that Instagram can't.

```bash
node bin/autodm.mjs new --platform facebook \
  --name "Call us" \
  --keyword BOOK \
  --dm "Easiest way is a quick call 👇" \
  --button "Call us|+14155551234;;Or book online|https://your-link.com"
```

The CLI works out which kind of button you meant from what follows the `|`: a phone number
makes a Call button, a URL makes a link button. Try a phone button on Instagram and it
refuses before sending, rather than letting Meta silently drop it.

---

## Step 9 — Write the post that makes it work

Same rule as Instagram: the word in the post has to be the word in the automation.

> Comment **PRICE** and I'll send the full breakdown over.

Facebook gives you something Instagram doesn't — **text-only posts work fine**. A plain
text post with a keyword call-to-action performs perfectly well as an automation trigger,
so you don't need to make an image for every one.

---

## Step 10 — Test it

From a **second Facebook account**, comment `PRICE` on the post.

**You should see:** a Messenger DM in 1–3 seconds, plus the public reply.

Same two non-bugs as Instagram:

- **You commenting on your own Page's post triggers nothing.** Use another account.
- **One DM per person, per automation, forever.** Commenting twice proves nothing.

Then:

```bash
node bin/autodm.mjs logs <id>
node bin/autodm.mjs stats
```

**Facebook reports more than Instagram does:** `delivered` is a real number here, because
Messenger emits delivery receipts. Instagram doesn't. If you run both, expect the Facebook
rows to look more complete — that's the platform, not your setup.

---

## What Facebook does and doesn't have

| | Instagram | Facebook |
|---|---|---|
| Comment → DM | ✅ | ✅ |
| Buttons in the DM (up to 3) | ✅ | ✅ |
| **Call (phone) buttons** | ❌ | ✅ |
| Public comment reply | ✅ | ✅ |
| Hide / delete comments | ✅ | ✅ |
| Like a comment | ❌ | ✅ |
| Manual private reply (7 days, one per comment) | ✅ | ✅ |
| **Story-reply triggers** | ✅ | ❌ |
| **Ice breakers** | ✅ | ❌ (Messenger has a persistent menu instead) |
| `delivered` in stats | ❌ | ✅ |
| Photo attached to a public reply | ❌ | ✅ |

Everything else — keywords, match modes, message variations, click tracking, contact tags,
per-post vs account-wide scoping — is identical on both.

---

## Running both at once

They're separate connected accounts, and 2 are free, so Instagram + one Facebook Page costs
nothing.

Create the rule twice, once per platform:

```bash
node bin/autodm.mjs new --keyword GUIDE --dm "..." --button "Get it|https://link.com"
node bin/autodm.mjs new --platform facebook --keyword GUIDE --dm "..." --button "Get it|https://link.com"
```

`node bin/autodm.mjs list` shows both, and `stats` scores them side by side — which is the
cheapest way to find out which audience actually converts for you.

---

## Next

- [FLOW.md](FLOW.md) — everything you can do, in order
- [BUTTONS.md](BUTTONS.md) — why buttons beat links
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) — when it goes quiet
