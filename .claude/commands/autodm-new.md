---
description: Create a new comment-to-DM automation — pick the keyword, write the DM, add the button
---

Create a new automation using the `autodm` skill.

Ask only three things: what they're giving away, what word people should comment, and where
the link goes. Then pick the closest template, show them the DM with `--dry-run --json`,
and create it once they're happy.

Default to scoping it to one post (`--post`) and to putting the link on a button rather
than in the message text.

$ARGUMENTS
