---
description: Read a post's comments, sort them, and draft replies — nothing gets posted without approval
---

Triage the comment section using the `autodm` skill.

```bash
node bin/autodm.mjs triage <postId> --json
```

That returns every comment with a first-pass read attached. **Do the real reasoning
yourself** — don't just relay the heuristic labels. Sort into: questions worth answering,
buying signals worth a personal DM, praise worth a short warm reply, spam to ignore, and
anything negative that the user should handle personally.

Show them your drafted replies grouped by category, then ask before anything goes out.
Post approved ones with:

```bash
node bin/autodm.mjs reply <postId> --comment <commentId> --message "..."
```

Never post a public reply they haven't seen. Never draft a defensive reply to a negative
comment — surface it and let them decide.

If they ask for a post id first: `node bin/autodm.mjs posts --json`.

$ARGUMENTS
