# Everything this can do

The complete surface, taken from Zernio's OpenAPI spec (`https://zernio.com/openapi.yaml`)
and its platform notes. If something here stops matching reality, the spec wins — Zernio
ships faster than this file.

Base URL: `https://zernio.com/api/v1` · Auth: `Authorization: Bearer sk_...`

---

## Instagram vs Facebook

Comment→DM runs on both. Zernio infers the platform from the `accountId`, so the CLI just
needs `--platform facebook` to resolve the right account. Everything below is identical on
both unless the table says otherwise.

| | Instagram | Facebook |
|---|---|---|
| Comment → DM automation | ✅ | ✅ |
| Buttons in the DM (max 3) | url, postback | url, postback, **phone** |
| Public comment reply | ✅ | ✅ (can attach a photo) |
| Hide / unhide, delete | ✅ | ✅ |
| Like a comment | ❌ | ✅ |
| Private reply (7 days, one per comment) | ✅ | ✅ |
| Quick replies on a private reply (max 13) | ✅ | ✅ |
| **Story-reply trigger** | ✅ | ❌ |
| **Ice breakers** | ✅ (max 4) | ❌ — Messenger persistent menu instead |
| `delivered` in stats | ❌ no receipt exists | ✅ |
| `read` in stats | ✅ `messaging_seen` | ✅ `message_reads` |
| Runs on | Business/Creator account | a **Page**, never a profile |

Facebook access tokens expire more often than Instagram's, and every automation on the
account goes silent when one does. Subscribe to `account.disconnected` if that matters.

---

## 1. Comment → DM

The core loop. Zernio subscribes to Meta's comment webhooks, so there is no polling: a
matching comment produces a DM in **1–3 seconds**.

`POST /v1/comment-automations` · CLI: `autodm new`

| Field | What it does |
|---|---|
| `keywords` | Words that trigger it. Empty array = **any** comment. |
| `matchMode` | `contains` (default) or `exact`. |
| `dmMessage` | The DM. Max **640** chars with buttons, ~**1000** without. |
| `buttons` | Up to 3 tappable buttons. See [BUTTONS.md](BUTTONS.md). |
| `commentReply` | A public reply on the comment, e.g. "Check your DMs 📩". |
| `dmMessageVariations` | Up to 5 alternate DMs, picked at random per trigger. |
| `commentReplyVariations` | Up to 5 alternate public replies, picked independently. |
| `linkTracking` | On by default. Wraps button links in a tracked redirect. |
| `clickTag` | Tags the contact when they click, so you can segment clickers. |
| `platformPostId` | Scope to one post. Omit for account-wide. |
| `trigger` | `comment` (default) or `story_reply`. |

**Deduplication is built in.** The same person will not be DMed twice by the same
automation. This is not configurable, and it is the thing most people mistake for a bug
while testing.

### Scoping

- **Per-post** — `--post <platformPostId>`. Only one *active* per-post automation is
  allowed per post; a second returns `409`. Per-post rules take priority on their post.
- **Account-wide** — omit `--post`. Evaluates every comment on every post. You can stack
  unlimited account-wide automations, each with its own keyword set, running independently.

### Story replies

`--story` switches the trigger to `story_reply`: someone replies to your Instagram story
with a keyword and gets a DM back. Pass a story media id to scope it to one story, or
leave it bare to match replies to any story. Instagram only.

### Managing them

| | |
|---|---|
| `GET /v1/comment-automations` | `autodm list` |
| `GET /v1/comment-automations/{id}` | `autodm show <id>` |
| `PATCH /v1/comment-automations/{id}` | `autodm edit <id>`, `pause`, `resume` |
| `DELETE /v1/comment-automations/{id}` | `autodm rm <id>` |
| `GET /v1/comment-automations/{id}/logs` | `autodm logs <id>` |

Pause keeps stats and logs. Delete destroys both.

---

## 2. What you can measure

`autodm stats` · from the automation's `stats` object.

| Metric | Meaning |
|---|---|
| `triggered` | Comments that matched. |
| `dmsSent` | DMs actually sent. |
| `dmsFailed` | Sends that errored — inspect with `logs --status failed`. |
| `uniqueContacts` | Distinct people reached. |
| `trackedSends` | DMs carrying a trackable link. **This is the CTR denominator**, not `dmsSent`. |
| `linkClicks` | Total clicks, bots and prefetch excluded. |
| `uniqueClicks` | Distinct people who clicked. |
| `read` | DMs confirmed read (Instagram `messaging_seen`). |
| `delivered` | Messenger only — **Instagram emits no delivery receipt.** |

So on Instagram, `read` is the closest thing to proof of delivery you will get. Anyone
selling you "guaranteed delivery" numbers for Instagram DMs is making them up.

Per-trigger logs carry `commenterName`, `commentText`, DM `status`
(`sent`/`failed`/`skipped`), and a separate `commentReplyStatus`. Note that if the DM
fails, the public reply is **not** attempted — it reports `skipped`.

---

## 3. Comments, by hand

The public side. `autodm comments`, `reply`, `hide`, `dm`.

| Action | Endpoint | Notes |
|---|---|---|
| List posts with comments | `GET /v1/inbox/comments` | Gives you post ids |
| Read a thread | `GET /v1/inbox/comments/{postId}` | Includes `canReply`/`canHide`/`isHidden` |
| Reply publicly | `POST /v1/inbox/comments/{postId}` | Optionally to a specific `commentId` |
| Hide / unhide | `POST .../{commentId}/hide` | Instagram, Facebook, Threads, X |
| Like | `POST .../{commentId}/like` | Not Instagram |
| Delete | `DELETE /v1/inbox/comments/{postId}` | |
| **Private reply** | `POST .../{commentId}/private-reply` | See below |

**Private reply** is the manual version of the whole system: DM one specific commenter.
Meta's limits are hard and worth knowing before you build a routine around it:

- **One per comment. Ever.**
- **Within 7 days** of the comment being posted.
- Instagram and Facebook only.
- Supports `buttons` (1–3) *or* `quickReplies` (up to 13) — never both.
- Quick-reply chips **do not render in the Message Requests folder**, where DMs from
  non-followers land. For anyone who doesn't already follow you, use buttons.

---

## 4. DM inbox

`GET /v1/inbox/conversations` · `.../messages` · `POST` to send.

Reading and sending DMs directly, outside any automation. Two things to know:

- Instagram/Facebook history from before you connected the account is replayed from Meta,
  capped at the **500 most recent messages per conversation**.
- Outside Meta's 24-hour messaging window, sends require a `HUMAN_AGENT` message tag.

## 5. Ice breakers

`PUT /v1/accounts/{id}/instagram-ice-breakers` · `autodm icebreakers set`

The tappable FAQ someone sees when they open your DMs for the first time. Up to **4**
questions, **80 characters** each. Cheap to set, and it catches people who never comment
at all.

## 6. Contacts, sequences, broadcasts

Everyone who triggers an automation is added to Zernio's contact CRM automatically, with
tags (including your `clickTag`) and cross-platform identity linking.

- `GET /v1/contacts` — filter by tag, platform, subscription status. `autodm contacts`
- `POST /v1/sequences` — multi-step follow-up drips, each step with a `delayMinutes` and a
  message. `exitOnReply` defaults to true, so a real conversation stops the sequence.
- `POST /v1/broadcasts` — one message to a filtered segment.

Sequences and broadcasts are deliberately **not** wired into this CLI. They send to people
on a timer rather than in reply to an action, which is a different thing with different
risks. The endpoints are in `lib/zernio.mjs` if you want them; read [RULES.md](RULES.md)
first.

## 7. Webhooks

`POST /v1/webhooks/settings` · `autodm webhook add`

Push events to your own server instead of polling. Relevant ones:

`comment.received` · `message.received` · `message.read` · `message.sent` ·
`message.failed` · `conversation.started` · `account.disconnected`

HMAC-SHA256 signing via `secret`. Auto-disabled after 10 consecutive delivery failures —
`account.disconnected` is the one worth alerting on, since it is what silently kills every
automation you have.

---

## Limits worth memorising

| | |
|---|---|
| DM text, with buttons | 640 chars |
| DM text, no buttons | ~1000 chars |
| Buttons per DM | 3, titles ≤ 20 chars |
| Message/reply variations | 5 each |
| Quick replies (private reply only) | 13 |
| Ice breakers | 4, questions ≤ 80 chars |
| Private reply window | 7 days, one per comment |
| API rate limit, free tier | 60 requests/min |
| API rate limit, 3+ accounts | 600 requests/min |

Rate-limit headers come back on every response — `X-RateLimit-Limit`, `-Remaining`,
`-Reset`. Read those rather than trusting this table.
