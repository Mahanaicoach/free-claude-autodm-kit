# What "free" actually means

Straight answer: **for one Instagram account, this costs nothing, with no card, with no
trial clock.** Here's the whole picture so nothing surprises you later.

## Zernio

| | |
|---|---|
| First **2 connected accounts** | **Free**, no credit card |
| Accounts 3–10 | $6/month each |
| Accounts 11–100 | $3/month each |
| 101+ | $1/month each |

Pricing is graduated — each tier's rate applies only to accounts in that range.

**There are no feature add-ons.** Every connected account includes scheduling, analytics,
the inbox (comments + DMs), full API access, and unlimited posts. Comment→DM automation is
part of the API, not a paid extra. A free account is not a crippled account.

One Instagram account = one connected account. So: free.

Rate limits do scale with your plan — the free tier is **60 API requests per minute**,
which is far more than this CLI will ever use. It's a throughput cap on the API, not a cap
on how many DMs your automations send.

### What does cost money

None of it is used by this repo, listed so you know what you're not signing up for:

- X/Twitter API calls (Twitter charges per request)
- Phone numbers, SMS, voice calls, WhatsApp messaging
- Ads management across the ad networks

## Instagram / Meta

Free. Instagram's Graph API costs nothing. You need a **Business or Creator** account
linked to a Facebook Page — also free.

## This repo

Free, MIT licensed, zero npm dependencies. Node 18+ and nothing else.

## Claude

If you're using Claude to drive the setup, that's whatever plan you're already on. The
repo works fine without it — every command is documented and runnable by hand.

---

## The honest caveats

- **Zernio can change its pricing.** The 2-free-accounts tier is current as of this
  writing; check <https://zernio.com/pricing> before you build a business on it.
- **Meta can change its API.** Every tool in this space, paid ones included, is subject to
  that. Nothing here can insulate you from it.
- **Adding a second Instagram account is still free. A third is $6/month.** That's the
  first real decision point.
