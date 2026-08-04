# When it isn't firing

Start here, always:

```bash
node bin/autodm.mjs doctor
```

It checks the key, the connection, and every automation, and tells you the fix. If that
comes back clean, work down this list.

---

## It looks broken but isn't

Rule these out first — they account for most "it stopped working" reports.

**You commented on your own post.** Your own account doesn't trigger your own automation.
Test from a second account.

**You already got the DM once.** Zernio will not DM the same person twice for the same
automation, ever. It isn't configurable. Commenting again to double-check will look like a
failure. Use a third account, or check `logs` — you'll see the trigger recorded as
`skipped`.

**You're looking in the wrong inbox.** A DM from an account you don't follow lands in
**Message Requests**, not the main inbox. Check there.

**It's been under 3 seconds.** Rare, but the pipeline is webhook-driven and near-instant —
if it's been a minute, something else is wrong.

---

## Nothing is being triggered at all

`node bin/autodm.mjs show <id>` and check, in this order:

**Is `isActive` true?** `resume <id>` if not.

**Do the keywords match what the caption tells people to type?** The single most common
cause. Your caption says "comment FREE", your automation listens for `GUIDE`.

**Is `matchMode` right?**
- `contains` — `GUIDE` matches "guide please", "GUIDE!!", "send me the guide". Use this.
- `exact` — the whole comment must be exactly the keyword. Misses everything else.

Short keywords with `contains` are the opposite failure: `ME` matches "awesome", "come on",
"amazing". Use `exact` for two-letter keywords.

**Is it scoped to the right post?** `list` shows `one post` vs `all posts`. If it's scoped
to a post, confirm the id matches the post people are actually commenting on.

**Is the account still connected?** Meta tokens expire, and every automation dies silently
when they do. `doctor` flags this. Fix: `connect instagram` (or `connect facebook`) again.

**Facebook tokens expire noticeably more often than Instagram's.** If a Page that worked
for weeks goes quiet with no other change, check this first. To be told instead of
noticing: `node bin/autodm.mjs webhook add --url https://your-server.com/hook --events
account.disconnected`.

**On Facebook, is it a Page?** Personal profiles cannot be automated by anyone. If `doctor`
shows no Facebook account after you connected one, you probably granted access to a profile
rather than a Page, or you only have moderator access. You need admin or editor.

---

## Triggers are recorded but DMs fail

```bash
node bin/autodm.mjs logs <id> --status failed
```

The `error` column carries Meta's reason. The usual ones:

| Error mentions | Means | Fix |
|---|---|---|
| permission / scope | A message permission was declined or revoked | `connect instagram`, approve everything |
| 24 hours / window | Outside Meta's messaging window | Not fixable per-send; the automation path normally isn't subject to this |
| user not found | Commenter deleted their account or blocked you | Nothing to do |
| policy | Meta rejected the content | Rewrite the DM; see [RULES.md](RULES.md) |

---

## Errors from the CLI

**`API key rejected`** — the key is wrong, expired, or deleted. Make a fresh one at
<https://zernio.com/dashboard/api-keys> and update `.env`.

**`No Instagram account connected`** — run `connect instagram`. If you *did* connect and
still see this, your account is probably still a **personal** account. It must be Business
or Creator; see [INSTAGRAM.md](INSTAGRAM.md).

**`No Facebook Page connected`** — run `connect facebook`. Personal profiles don't count;
see [FACEBOOK.md](FACEBOOK.md).

**`phone buttons are Facebook-only`** — you added a Call button to an Instagram automation.
Instagram doesn't render them. Use a link button, or add `--platform facebook`.

**`Story-reply triggers are Instagram-only`** — `--story` on a Facebook Page. Facebook has
no story-reply webhook; use the comment trigger.

**`This post already has an active per-post automation`** (409) — one active per-post rule
per post. `list`, find it, `edit` it, or `rm` it and start over.

**`Rate limited`** — free tier is 60 requests/minute. Wait a minute.

**`Zernio says this needs a paid plan`** (402) — you're over 2 connected accounts.
Disconnect the extras in the Zernio dashboard.

**`Inbox addon required`** (403) — current Zernio plans include the inbox. Seeing this
means the account is on a legacy plan; contact Zernio.

**`dmMessage is N chars, over the 640 limit`** — you attached a button, which drops the cap
from ~1000 to 640. Shorten the DM or drop the button. Shorten the DM.

---

## The public reply didn't post

The public "check your DMs" reply is attempted **after** the DM, and skipped entirely if
the DM failed. `logs` shows `commentReplyStatus` separately from `status` — if the DM shows
`failed`, the reply showing `skipped` is expected behaviour, not a second bug.

---

## Still stuck

`node bin/autodm.mjs show <id> --json` and `logs <id> --json` give you everything the API
knows. Paste both to Claude in this repo and ask it to diagnose — that's what `/autodm-fix`
does.

Zernio's own support: support@zernio.com · API reference: <https://docs.zernio.com>
