# Buttons, not links

The single change that makes the biggest difference to whether this works.

## The problem with a link in the text

When someone who **doesn't follow you** gets a DM, it lands in Instagram's **Message
Requests** folder. In that folder a URL sitting in the message body does not render as a
tappable link. It's grey text. Most people never open the request at all, and the ones who
do have nothing to tap.

A **button** renders. It's a real control, in the message bubble, in the requests folder.

Since most people commenting a keyword on a post that reached them are, by definition, not
followers yet — this is not an edge case. It's the majority of your DMs.

## Adding one

```bash
--button "Get the guide|https://your-link.com"
```

Two or three, separated by `;;`:

```bash
--button "Get the guide|https://link.com;;Book a call|https://cal.com"
```

## The three kinds

| Type | Written as | Does |
|---|---|---|
| **url** | `"Label\|https://…"` | Opens a link. This is the one you want. |
| **postback** | `"Label\|SOME_PAYLOAD"` | Sends a payload to your webhook. No link. |
| **phone** | `"Label\|+14155551234"` | Dials. **Facebook only — invisible on Instagram.** |

The CLI infers the type from what's after the `|`: a URL makes a url button, a phone number
makes a phone button, anything else makes a postback.

## Rules Meta enforces

- **3 buttons maximum.**
- **Titles cap at 20 characters.** Longer and Meta truncates mid-word.
- **Attaching any button drops the DM text limit from ~1000 to 640 characters.** This
  catches people out constantly. `autodm` checks it before sending so you find out while
  writing, not after a commenter has already triggered it.

## Writing button labels

Say what happens, in as few words as fit:

- ✅ `Get the guide` · `Pick a time` · `See pricing` · `Hold my spot`
- ❌ `Click here` · `Learn more` · `Download the free 47-page…` (truncated anyway)

## The second button

A second button lowers the pressure of the first. Pair the ask with an out:

```bash
--button "Hold my spot|https://link.com;;I have a question|ASK_QUESTION"
```

The second one is a postback — no link, it just fires an event you can catch on a webhook,
or simply signals interest you can read in `contacts`.

## Tracking

Link tracking is **on by default**: button URLs get wrapped in a redirect so clicks are
counted. Turn it off with `--no-tracking` if you need the URL passed through untouched.

Add `--click-tag "downloaded-guide"` and everyone who clicks gets tagged in your contacts,
which is how you find the people worth following up with:

```bash
node bin/autodm.mjs contacts --tag downloaded-guide
```

CTR in `autodm stats` is **unique clicks ÷ trackable sends** — not ÷ DMs sent. A campaign
that predates click tracking will show fewer trackable sends than DMs sent, and that's
expected rather than a bug.
