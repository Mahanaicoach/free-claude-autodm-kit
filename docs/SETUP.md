# Setup

Pick your platform. Both guides are complete, step by step, with what you should see after
each step.

### → [Instagram, step by step](INSTAGRAM.md)

Comment→DM, story replies, ice breakers. Needs a **Business or Creator** account — personal
accounts can't use the API at all.

### → [Facebook, step by step](FACEBOOK.md)

Comment→DM on a **Page**, plus Call buttons that Instagram doesn't have. Personal profiles
can't be automated by anyone.

### Doing both?

Start with Instagram, then jump to step 4 of the Facebook guide — the Zernio account and
API key are shared. Two connected accounts are free, so Instagram + one Page costs nothing.

---

## The short version

Both guides come down to the same five things:

1. **Node 18+** — `node --version`
2. **Zernio account** — <https://zernio.com/signup>, free, no card
3. **API key** into `.env` — <https://zernio.com/dashboard/api-keys>
4. **Connect the account** — `node bin/autodm.mjs connect instagram`
5. **First automation** — `node bin/autodm.mjs new ...`

Check progress at any point with:

```bash
node bin/autodm.mjs doctor
```

It tells you which of the five is missing and the exact command to fix it.

---

## Or don't do any of it

Open this repo in [Claude](https://claude.ai/code) and say:

> set up my auto DM

Claude runs every command, walks you through the two browser steps that need you, and
writes the DM with you. You sign up, type your own password, approve Meta's permissions,
and paste your own API key — those stay yours by design. Everything else it handles.

Once you're set up: [the complete flow](FLOW.md).
