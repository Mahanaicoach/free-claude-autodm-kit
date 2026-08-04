---
description: Diagnose an auto-DM that isn't firing
---

Something isn't working. Diagnose it using the `autodm` skill's troubleshooting order —
don't guess, and don't start by rewriting the DM.

1. `node bin/autodm.mjs doctor --json`
2. `node bin/autodm.mjs list --json` — is it active, and is it scoped where they think?
3. `node bin/autodm.mjs show <id> --json` — do the keywords match the caption?
4. `node bin/autodm.mjs logs <id> --status failed --json`

Before concluding it's broken, rule out the two things that look like bugs and aren't:
Zernio won't DM the same person twice per automation, and the account owner commenting on
their own post doesn't trigger anything.

$ARGUMENTS
