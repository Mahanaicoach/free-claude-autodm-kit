# Instagram — the whole thing, step by step

Every step, in order, with what you should see after each one. Roughly 10 minutes, most of
it waiting on Meta's permission screen.

If you'd rather not do this by hand: open the repo in Claude and say **"set up my auto DM
for Instagram"**. It runs all of it. This page is what it's doing.

---

## Step 0 — Switch to a Business or Creator account

**Do this first.** Instagram's API does not work with personal accounts, and nothing later
will tell you so clearly — your automation will simply never fire, with no error anywhere.

On your phone:

1. Instagram → your profile → **☰** (top right)
2. **Settings and privacy**
3. Scroll to **Account type and tools**
4. **Switch to professional account**
5. Pick **Creator** or **Business** — either works
6. Instagram will ask you to connect or create a **Facebook Page**. Do it. A Page is
   required even if you never post to it. Creating one takes about 30 seconds and is free.

**How to check it worked:** your profile now shows a "Professional dashboard" link.

> This is free and reversible. It does not change how your posts look to anyone.

---

## Step 1 — Check Node

In the repo folder:

```bash
node --version
```

**You should see:** `v18.x.x` or higher.

If it errors, install Node from [nodejs.org](https://nodejs.org) (take the LTS button) and
try again.

---

## Step 2 — Create a Zernio account

Zernio is the service that talks to Instagram for you. It's a Meta Business Partner using
Meta's official API — nothing logs into your account, nothing scrapes.

1. Go to **<https://zernio.com/signup>**
2. Sign up with email or Google
3. No credit card is requested. If one is, you're on the wrong page.

**You should see:** the Zernio dashboard.

The first **2 connected accounts are free permanently**. One Instagram account uses one of
them. Details in [PRICING.md](PRICING.md).

---

## Step 3 — Create an API key

The key lets this repo act on your Zernio account. It's a password. Treat it like one.

1. Go to **<https://zernio.com/dashboard/api-keys>**
2. Click **Create key**
3. Name it `autodm`
4. **Copy it immediately** — Zernio shows the full key exactly once. If you lose it, delete
   that key and make another; nothing breaks.

Now put it in the repo:

```bash
cp .env.example .env
```

Open `.env` in any text editor and replace `sk_your_key_here` with the key you copied:

```
ZERNIO_API_KEY=sk_1234567890abcdef...
```

Save. `.env` is gitignored, so it won't end up on GitHub if you push this repo somewhere.

**Never** paste this key into a screenshot, a post, or a DM.

**Check it:**

```bash
node bin/autodm.mjs doctor
```

**You should see:** `✓ API key valid · profile "..."` and then a line telling you nothing
is connected yet. That's correct — that's the next step.

---

## Step 4 — Connect Instagram

```bash
node bin/autodm.mjs connect instagram
```

**You should see:** a long `https://www.facebook.com/...` URL.

Open it in a browser where you're logged into the Facebook account that manages your
Instagram. Then:

1. **Log in to Facebook** if asked
2. **Pick the Facebook Page** linked to your Instagram account
3. **Pick the Instagram account**
4. **The permissions screen** — this is the important one

On the permissions screen, leave **everything** switched on. The ones that matter:

| Permission | Why |
|---|---|
| Manage comments | How the automation sees the comment |
| Manage messages | How it sends the DM |
| Access insights | Stats |
| Manage content | Reading which post a comment is on |

**If you turn off comments or messages, the automation will install fine and then never
work.** There is no warning. This is the single most common setup failure.

5. Approve, and let it redirect back

**Check it:**

```bash
node bin/autodm.mjs doctor
```

**You should see:** `✓ Instagram connected: @yourhandle`

If you declined something by accident, just run `connect instagram` again and redo it.

---

## Step 5 — Find the post

```bash
node bin/autodm.mjs posts
```

**You should see:** a table of your recent posts — post id, date, comment count, and the
start of the caption.

Copy the **post id** from the first column of the post you want to automate.

> Don't have the post up yet? You can skip this and make an **account-wide** rule that
> fires on every post — just leave `--post` off. Scoping to one post is safer while you're
> learning.

---

## Step 6 — Create the automation

```bash
node bin/autodm.mjs new \
  --name "Free guide" \
  --keyword GUIDE \
  --dm "Hey! Here's the guide I promised 👇 It's the exact thing I use — no email needed." \
  --button "Get the guide|https://your-link.com" \
  --reply "Sent it to your DMs 📩" \
  --post <the post id> \
  --dry-run
```

`--dry-run` shows you exactly what will be created without creating it. Read it over. When
you're happy, run the same command **without** `--dry-run`.

**You should see:** `✓ "Free guide" · id abc123...` and a summary of the keyword, the DM,
and the button.

What each flag does:

| Flag | |
|---|---|
| `--keyword GUIDE` | The word people comment. Caps in the caption, but matching ignores case. |
| `--dm "..."` | The DM they receive. Max 640 characters once a button is attached. |
| `--button "Label\|url"` | The tappable button. **Use this instead of putting the link in the text** — see [BUTTONS.md](BUTTONS.md). |
| `--reply "..."` | A public reply under their comment. Tells everyone else scrolling that it's real. |
| `--post <id>` | Only this post. Leave it off for every post. |

Prefer starting from a ready-made rule? `node bin/autodm.mjs templates` lists five.

---

## Step 7 — Write the caption that makes it work

The automation is only half of it. The caption has to tell people what to type, and the
word has to match **exactly** what you set as the keyword.

> …full breakdown is in the guide — comment **GUIDE** and I'll send it over.

Three rules:

- **One word.** "Comment GUIDE" beats "comment 'send me the guide please'".
- **Say it twice** — once in the caption, once in the video or on the last slide.
- **Match the keyword you actually set.** Caption says `FREE`, automation listens for
  `GUIDE` → nothing happens. This is the second most common failure.

---

## Step 8 — Test it

From a **second Instagram account** (a friend's, or your own personal one), comment `GUIDE`
on that post.

**You should see:** a DM arrive in 1–3 seconds, and a public reply appear under the comment.

**Check where it landed.** If that second account doesn't follow you, the DM is in
**Message Requests**, not the main inbox. That's normal and it's exactly why the link is on
a button — in that folder, a plain URL isn't tappable.

Two things that look broken and aren't:

- **Your own account commenting on your own post does nothing.** Use a different account.
- **The same person only ever gets one DM per automation, ever.** Commenting a second time
  to "check it still works" proves nothing. It's deduplication, not a bug.

Then look at the record:

```bash
node bin/autodm.mjs logs <the automation id>
```

**You should see:** a row per triggering comment, with who commented, what they wrote, and
whether the DM sent.

---

## Step 9 — Watch it

```bash
node bin/autodm.mjs stats
```

triggered · sent · failed · read · unique clicks · CTR, per automation.

CTR is unique clicks ÷ trackable sends. Instagram sends **no delivery receipt**, so `read`
is the closest thing to delivery confirmation that exists — anyone quoting you guaranteed
Instagram DM delivery rates is guessing.

---

## What's next

- [FLOW.md](FLOW.md) — everything you can do from here, in the order it makes sense
- [BUTTONS.md](BUTTONS.md) — why the button matters more than the words
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) — when it's quiet
- Doing Facebook too? [FACEBOOK.md](FACEBOOK.md) — same tool, one extra step

## Instagram-only features

Worth knowing you have these:

- **Story replies** — `--story` makes the trigger a story reply instead of a comment.
  Post a story saying "reply LINK", get the same automation.
- **Ice breakers** — the tappable FAQ on your DM screen for people who never comment:
  `node bin/autodm.mjs icebreakers set --q "How much?|PRICING;;Do you take clients?|CLIENTS"`

Neither exists on Facebook. In exchange, Facebook gets Call buttons.
