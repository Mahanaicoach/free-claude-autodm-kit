#!/usr/bin/env node
/**
 * autodm — a command line for Instagram comment→DM automation on Zernio.
 *
 * Every command accepts --json for machine-readable output, which is what
 * Claude uses when it drives this on your behalf.
 *
 * Run `node bin/autodm.mjs help` for the command list.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { Zernio, ZernioError } from '../lib/zernio.mjs';
import { loadEnv, readConfig, writeConfig, saveApiKey, ROOT } from '../lib/config.mjs';
import { validateAutomation, validateIceBreakers, lintAutomation, ValidationError, LIMITS } from '../lib/validate.mjs';
import { writeDm, triage, isAutoReplySafe, haveClaude } from '../lib/brain.mjs';
import { c, heading, ok, warn, fail, info, step, table, json, ask, confirm, truncate } from '../lib/ui.mjs';

loadEnv();

// ── argument parsing ──────────────────────────────────────────────────────

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) { positional.push(arg); continue; }
    const eq = arg.indexOf('=');
    if (eq !== -1) {
      flags[arg.slice(2, eq)] = arg.slice(eq + 1);
    } else {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) { flags[key] = next; i++; }
      else flags[key] = true;
    }
  }
  return { positional, flags };
}

/** --keyword can be repeated or comma-separated. */
function list(value) {
  if (value === undefined || value === true) return undefined;
  return String(value).split(',').map((s) => s.trim()).filter(Boolean);
}

/** --button "Get the guide|https://example.com" (repeatable via commas is unsafe in URLs, so use ;;) */
function parseButtons(value) {
  if (!value || value === true) return undefined;
  return String(value)
    .split(';;')
    .map((spec) => {
      const [title, target] = spec.split('|').map((s) => s.trim());
      if (target && /^\+?\d[\d\s-]+$/.test(target)) return { type: 'phone', title, phone: target };
      if (target && /^https?:\/\//.test(target)) return { type: 'url', title, url: target };
      return { type: 'postback', title, payload: target || title.toUpperCase().replace(/\s+/g, '_') };
    });
}

// ── shared helpers ────────────────────────────────────────────────────────

function client() {
  return new Zernio(process.env.ZERNIO_API_KEY);
}

/** Which platform a command targets. Instagram unless told otherwise. */
function platformOf(flags) {
  const p = flags.platform || (flags.facebook ? 'facebook' : null) || readConfig().platform || 'instagram';
  if (!['instagram', 'facebook'].includes(p)) {
    throw new Error(`Platform "${p}" is not supported here — comment→DM works on instagram and facebook.`);
  }
  return p;
}

const CONNECT_NOTES = {
  instagram:
    'Instagram must be a Business or Creator account, linked to a Facebook Page.\n' +
    '  Personal accounts cannot use the API at all — switching is free, in\n' +
    '  Instagram → Settings → Account type and tools.',
  facebook:
    'Facebook automation runs on a Page, never a personal profile. You need to be\n' +
    '  an admin or editor of the Page. Meta will ask you to pick which Page to connect.',
};

const NOT_CONNECTED = {
  instagram:
    'No Instagram account connected. Run: autodm connect instagram\n' +
    '  Instagram must be a Business or Creator account — personal accounts cannot use the API.',
  facebook:
    'No Facebook Page connected. Run: autodm connect facebook\n' +
    '  Facebook automation runs on a Page, not a personal profile, and you need admin access to it.',
};

/** Resolves profileId/accountId from flags, then config, then the API. */
async function resolveContext(z, flags) {
  const cfg = readConfig();
  const platform = platformOf(flags);
  let profileId = flags.profile || cfg.profileId;
  let accountId = flags.account || (cfg.platform === platform ? cfg.accountId : null);

  if (!profileId) {
    const { profiles = [] } = await z.listProfiles();
    if (profiles.length === 0) throw new Error('No Zernio profile yet. Run: autodm setup');
    profileId = (profiles.find((p) => p.isDefault) || profiles[0])._id;
  }
  if (!accountId) {
    const { accounts = [] } = await z.listAccounts({ profileId, platform });
    if (accounts.length === 0) throw new Error(NOT_CONNECTED[platform]);
    accountId = accounts[0]._id;
  }
  return { profileId, accountId, platform };
}

function loadTemplate(name) {
  const path = join(ROOT, 'templates', `${name}.json`);
  if (!existsSync(path)) {
    const available = readdirSync(join(ROOT, 'templates'))
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace('.json', ''));
    throw new Error(`No template "${name}". Available: ${available.join(', ')}`);
  }
  return JSON.parse(readFileSync(path, 'utf8'));
}

function ctr(stats = {}) {
  const denom = stats.trackedSends || 0;
  if (!denom) return '—';
  return `${((stats.uniqueClicks || 0) / denom * 100).toFixed(1)}%`;
}

// ── commands ──────────────────────────────────────────────────────────────

const commands = {};

commands.help = () => {
  console.log(`
${c.bold('autodm')} — Instagram comment→DM automation, free tier, powered by Zernio

${c.bold('Getting started')}
  setup                       Walk through signup, connecting Instagram, and the API key
  doctor                      Check that everything is wired up and tell you what is not
  connect [platform]          Print the OAuth URL to connect an account (default: instagram)
  accounts                    List connected accounts

${c.bold('Automations (comment → DM)')}
  new                         Create an automation (see flags below, or --template <name>)
  list                        List every automation with live stats
  show <id>                   One automation in full, plus its recent trigger log
  edit <id>                   Change keywords, DM text, buttons, reply (same flags as new)
  pause <id> | resume <id>    Toggle without deleting (stats survive)
  rm <id>                     Delete permanently, logs included
  logs <id>                   Every comment that triggered it, with send status
  stats                       Scoreboard across all automations
  templates                   List the ready-made automation recipes

${c.bold('Claude writes and reads for you')}
  write                       Draft the DM, button and public reply from your offer
                              --offer "..." --link https://... [--keyword GUIDE] [--create]
  triage <postId>             Read the comments — question, buying signal, praise, spam —
                              and draft a public reply for each. Posts nothing.
  answer <postId>             Post the replies triage judged safe   [--send to actually post]

${c.dim('  These use your logged-in `claude` CLI if there is one, and fall back to keyword')}
${c.dim('  rules if not. No API key, ever. When Claude Code runs this repo it does the')}
${c.dim('  thinking itself — `--json` is how it reads the input.')}

${c.bold('Comments')}
  posts                       Recent posts with comment counts (gives you the post id)
  comments <postId>           Read a post's comment thread
  reply <postId>              Public reply    --message "..." [--comment <commentId>]
  hide <postId> <commentId>   Hide a comment  [--unhide]
  dm <postId> <commentId>     Private reply to one commenter (7-day window, one per comment)

${c.bold('Instagram DM extras')}
  icebreakers                 Show the FAQ buttons on your DM screen
  icebreakers set             Set them  --q "Question|PAYLOAD;;Another|PAYLOAD2"
  contacts                    People who triggered your automations (Zernio CRM)
  webhook                     List webhooks; \`webhook add --url ...\` to create one

${c.bold('Flags for new / edit')}
  --name "..."                Label for the automation
  --keyword word,word         Trigger keywords (repeatable via commas)
  --match contains|exact      Default: contains
  --dm "..."                  The DM text        (max ${LIMITS.DM_WITH_BUTTONS} with buttons, ~${LIMITS.DM_PLAIN} without)
  --button "Label|https://…"  Up to 3, separated by ;;   (this is the button, not just text)
  --reply "..."               Public comment reply, e.g. "Check your DMs 📩"
  --dm-variation "a;;b"       Up to 5 alternate DM texts, rotated at random
  --reply-variation "a;;b"    Up to 5 alternate public replies
  --post <platformPostId>     Scope to one post. Omit for account-wide (fires on every post)
  --story [<storyId>]         Story-reply trigger instead of comment
  --click-tag "tag"           Tag people who click the link, for follow-up
  --no-tracking               Send links raw instead of through a click-tracked redirect
  --any-comment               Confirm you really mean "no keywords, DM everyone"
  --platform facebook         Target a Facebook Page instead of Instagram (default: instagram)
  --json                      Machine-readable output (used by Claude)

${c.bold('Instagram vs Facebook')}
  Everything above works on both. Instagram-only: story-reply triggers, ice breakers.
  Facebook-only: phone (Call) buttons. Facebook runs on a Page, never a personal profile.
  Set your default once with --platform, or pass it per command.

${c.dim('Docs: docs/FEATURES.md · Setup: docs/SETUP.md · Stuck: docs/TROUBLESHOOTING.md')}
`);
};

commands.setup = async ({ flags }) => {
  heading('AutoDM Kit setup');
  console.log(
    'Four things need to exist: a Zernio account, an Instagram Business/Creator account\n' +
      'connected to it, an API key, and one automation. This walks all four.\n'
  );

  step(1, 'Zernio account');
  if (!process.env.ZERNIO_API_KEY) {
    info('Sign up free (2 accounts, no card): https://zernio.com/signup');
    info('Then create a key at:               https://zernio.com/dashboard/api-keys');
    const key = await ask('\nPaste your API key (starts with sk_):');
    if (!key) {
      warn('No key entered. Put it in .env as ZERNIO_API_KEY and re-run: node bin/autodm.mjs setup');
      return;
    }
    saveApiKey(key);
    process.env.ZERNIO_API_KEY = key;
    ok('Saved to .env (gitignored)');
  } else {
    ok('API key found in .env');
  }

  const z = client();

  step(2, 'Profile');
  let { profiles = [] } = await z.listProfiles();
  if (profiles.length === 0) {
    const created = await z.createProfile('My Brand');
    profiles = [created.profile || created];
    ok('Created profile "My Brand"');
  }
  const profile = profiles.find((p) => p.isDefault) || profiles[0];
  writeConfig({ profileId: profile._id, profileName: profile.name });
  ok(`Using profile "${profile.name}"`);

  const platform = platformOf(flags);
  step(3, platform === 'facebook' ? 'Facebook Page' : 'Instagram account');
  const { accounts = [] } = await z.listAccounts({ profileId: profile._id, platform });
  if (accounts.length === 0) {
    const { authUrl } = await z.connectUrl(platform, profile._id);
    info(CONNECT_NOTES[platform]);
    info('\nOpen this URL, approve all permissions, then re-run setup:\n');
    console.log('  ' + c.cyan(authUrl) + '\n');
    warn('Approve every permission Meta asks for — comments and messages are the two that matter.');
    return;
  }
  const account = accounts[0];
  writeConfig({ accountId: account._id, accountUsername: account.username, platform });
  ok(`Connected: ${account.username || account.displayName} (${platform})`);

  step(4, 'Your first automation');
  info('Pick a template and create it:\n');
  info(c.dim('  node bin/autodm.mjs templates'));
  info(c.dim('  node bin/autodm.mjs new --template lead-magnet --keyword GUIDE \\'));
  info(c.dim('       --dm "Here it is 👇" --button "Get the guide|https://your-link.com"'));
  console.log('');
  ok('Setup complete. Run `node bin/autodm.mjs doctor` any time to re-check.');
};

commands.doctor = async ({ flags }) => {
  if (!flags.json) heading('Diagnosis');
  const findings = [];
  const add = (level, msg, fix) => findings.push({ level, msg, fix });

  if (!process.env.ZERNIO_API_KEY) {
    add('fail', 'No ZERNIO_API_KEY', 'Run: node bin/autodm.mjs setup');
    if (flags.json) return json({ ok: false, findings });
    for (const f of findings) fail(`${f.msg} → ${f.fix}`);
    return;
  }

  const z = client();
  let profileId;

  try {
    const { profiles = [] } = await z.listProfiles();
    if (profiles.length === 0) add('fail', 'No profile', 'Run: node bin/autodm.mjs setup');
    else {
      profileId = (profiles.find((p) => p.isDefault) || profiles[0])._id;
      add('ok', `API key valid · profile "${(profiles.find((p) => p.isDefault) || profiles[0]).name}"`);
    }
  } catch (err) {
    add('fail', err.message, 'Create a fresh key at https://zernio.com/dashboard/api-keys');
  }

  if (profileId) {
    const { accounts = [] } = await z.listAccounts({ profileId });
    let connected = 0;

    for (const platform of ['instagram', 'facebook']) {
      const found = accounts.filter((a) => a.platform === platform);
      if (found.length === 0) continue;
      connected++;
      const label = platform === 'facebook' ? 'Facebook Page' : 'Instagram';
      add('ok', `${label} connected: ${found[0].username || found[0].displayName}`);
      if (found[0].isActive === false) {
        add('fail', `That ${label} shows as disconnected`, `Reconnect: node bin/autodm.mjs connect ${platform}`);
      }
    }
    if (connected === 0) {
      add(
        'fail',
        'Nothing connected to automate',
        'Run: node bin/autodm.mjs connect instagram   (or: connect facebook)'
      );
    }
    if (accounts.length > 2) {
      add('warn', `${accounts.length} accounts connected — only the first 2 are free`, 'Disconnect the extras to stay on the free tier');
    }
  }

  if (profileId) {
    try {
      const { automations = [] } = await z.listAutomations(profileId);
      const active = automations.filter((a) => a.isActive);
      if (automations.length === 0) {
        add('warn', 'No automations yet', 'Run: node bin/autodm.mjs new --template lead-magnet');
      } else {
        add('ok', `${automations.length} automation(s), ${active.length} active`);
        for (const a of automations) {
          if (a.isActive && (a.keywords || []).length === 0 && !a.platformPostId) {
            add('warn', `"${a.name}" DMs every commenter on every post`, 'Add keywords, or scope it to one post');
          }
          if ((a.stats?.dmsFailed || 0) > 0) {
            add('warn', `"${a.name}" has ${a.stats.dmsFailed} failed sends`, `Inspect: node bin/autodm.mjs logs ${a.id} --status failed`);
          }
        }
      }
    } catch (err) {
      add('warn', `Could not read automations: ${err.message}`);
    }
  }

  const rl = z.lastRateLimit;
  if (rl?.limit) add('ok', `Rate limit ${rl.remaining}/${rl.limit} remaining this window`);

  if (flags.json) return json({ ok: !findings.some((f) => f.level === 'fail'), findings });

  for (const f of findings) {
    const line = f.fix ? `${f.msg} → ${c.dim(f.fix)}` : f.msg;
    if (f.level === 'ok') ok(line);
    else if (f.level === 'warn') warn(line);
    else fail(line);
  }
  console.log('');
};

commands.connect = async ({ positional, flags }) => {
  const platform = positional[0] || 'instagram';
  const z = client();
  const cfg = readConfig();
  let profileId = flags.profile || cfg.profileId;
  if (!profileId) {
    const { profiles = [] } = await z.listProfiles();
    profileId = (profiles.find((p) => p.isDefault) || profiles[0])?._id;
  }
  const res = await z.connectUrl(platform, profileId, flags.redirect);
  if (flags.json) return json(res);
  heading(`Connect ${platform}`);
  if (CONNECT_NOTES[platform]) {
    info(CONNECT_NOTES[platform]);
    info('\n  Approve every permission — comments and messages are what the automation runs on.\n');
  }
  console.log('  ' + c.cyan(res.authUrl) + '\n');
  info('When it redirects back, run: node bin/autodm.mjs doctor');
};

commands.accounts = async ({ flags }) => {
  const z = client();
  const { accounts = [] } = await z.listAccounts({ platform: flags.platform });
  if (flags.json) return json(accounts);
  heading('Connected accounts');
  table(
    ['id', 'platform', 'username', 'active'],
    accounts.map((a) => [a._id, a.platform, a.username || a.displayName || '', a.isActive === false ? 'no' : 'yes'])
  );
};

/** Builds an automation payload from flags, optionally starting from a template. */
function buildPayload(flags, { profileId, accountId }) {
  const base = flags.template ? loadTemplate(flags.template) : {};
  const buttons = parseButtons(flags.button) ?? base.buttons;
  const keywords = list(flags.keyword) ?? base.keywords;

  const payload = {
    profileId,
    accountId,
    name: flags.name || base.name || 'AutoDM',
    dmMessage: flags.dm || base.dmMessage,
    keywords: keywords || [],
    matchMode: flags.match || base.matchMode || 'contains',
  };

  if (buttons) payload.buttons = buttons;
  if (flags.reply || base.commentReply) payload.commentReply = flags.reply || base.commentReply;

  const dmVars = flags['dm-variation'] ? String(flags['dm-variation']).split(';;') : base.dmMessageVariations;
  if (dmVars) payload.dmMessageVariations = dmVars;

  const replyVars = flags['reply-variation'] ? String(flags['reply-variation']).split(';;') : base.commentReplyVariations;
  if (replyVars) payload.commentReplyVariations = replyVars;

  if (flags.post) payload.platformPostId = flags.post;
  if (flags.story) {
    payload.trigger = 'story_reply';
    if (typeof flags.story === 'string') payload.platformPostId = flags.story;
  }
  if (flags['click-tag'] || base.clickTag) payload.clickTag = flags['click-tag'] || base.clickTag;
  if (flags['no-tracking']) payload.linkTracking = false;
  if (flags['post-title']) payload.postTitle = flags['post-title'];

  return payload;
}

commands.new = async ({ flags }) => {
  // A dry run is for checking the wording, so let it work before setup is finished.
  const offlinePreview = flags['dry-run'] && !process.env.ZERNIO_API_KEY;
  const z = offlinePreview ? null : client();
  const ctx = offlinePreview
    ? { profileId: '<profileId>', accountId: '<accountId>', platform: platformOf(flags) }
    : await resolveContext(z, flags);
  const payload = buildPayload(flags, ctx);

  if (flags['any-comment']) payload.keywords = [];
  try {
    validateAutomation(payload, { platform: ctx.platform });
  } catch (err) {
    if (!(err instanceof ValidationError)) throw err;
    if (flags.json) return json({ ok: false, problems: err.problems });
    heading('Cannot create this automation yet');
    for (const p of err.problems) fail(p);
    console.log('');
    return process.exit(1);
  }

  const warnings = lintAutomation(payload);

  if (flags['dry-run']) {
    if (flags.json) return json({ ok: true, dryRun: true, payload, warnings });
    heading('Dry run — nothing sent');
    json(payload);
    for (const w of warnings) warn(w);
    return;
  }

  const res = await z.createAutomation(payload);
  const a = res.automation || {};

  if (flags.json) return json({ ok: true, automation: a, warnings });

  heading('Automation live');
  ok(`"${a.name}" · id ${a.id}`);
  info(`Platform: ${a.platform || ctx.platform}`);
  info(`Trigger: ${a.trigger === 'story_reply' ? 'story reply' : 'comment'}${payload.platformPostId ? ' on one post' : ' on any post'}`);
  info(`Keywords: ${(a.keywords || []).length ? a.keywords.join(', ') : c.yellow('any comment')} (${a.matchMode})`);
  info(`DM: ${truncate(a.dmMessage, 70)}`);
  if (a.buttons?.length) info(`Buttons: ${a.buttons.map((b) => `[${b.title}]`).join(' ')}`);
  if (a.commentReply) info(`Public reply: ${truncate(a.commentReply, 60)}`);
  console.log('');
  for (const w of warnings) warn(w);
  info(c.dim(`Watch it work: node bin/autodm.mjs logs ${a.id}`));
};

commands.list = async ({ flags }) => {
  const z = client();
  const cfg = readConfig();
  const { automations = [] } = await z.listAutomations(flags.profile || cfg.profileId);
  if (flags.json) return json(automations);
  heading('Automations');
  table(
    ['id', 'name', 'trigger', 'scope', 'keywords', 'on', 'sent'],
    automations.map((a) => [
      a.id,
      truncate(a.name, 24),
      a.trigger === 'story_reply' ? 'story' : 'comment',
      a.platformPostId ? 'one post' : 'all posts',
      truncate((a.keywords || []).join(',') || 'ANY', 20),
      a.isActive ? c.green('yes') : c.dim('no'),
      a.stats?.dmsSent ?? 0,
    ])
  );
};

commands.show = async ({ positional, flags }) => {
  const id = positional[0];
  if (!id) throw new Error('Usage: autodm show <automationId>');
  const z = client();
  const res = await z.getAutomation(id);
  if (flags.json) return json(res);

  const a = res.automation || {};
  heading(a.name || id);
  info(`Status:   ${a.isActive ? c.green('active') : c.yellow('paused')}`);
  info(`Trigger:  ${a.trigger === 'story_reply' ? 'story reply' : 'comment'} · ${a.platformPostId ? `post ${a.platformPostId}` : 'account-wide'}`);
  info(`Keywords: ${(a.keywords || []).join(', ') || 'any'} (${a.matchMode})`);
  info(`Tracking: ${a.linkTracking === false ? 'off' : 'on'}${a.clickTag ? ` · tag "${a.clickTag}"` : ''}`);
  console.log(`\n${c.dim('DM')}\n  ${a.dmMessage}`);
  if (a.buttons?.length) {
    console.log(`\n${c.dim('Buttons')}`);
    for (const b of a.buttons) info(`[ ${b.title} ] → ${b.url || b.payload || b.phone}`);
  }
  if (a.dmMessageVariations?.length) {
    console.log(`\n${c.dim(`Rotated variations (${a.dmMessageVariations.length})`)}`);
    a.dmMessageVariations.forEach((v, i) => info(`${i + 1}. ${truncate(v, 70)}`));
  }
  if (a.commentReply) console.log(`\n${c.dim('Public reply')}\n  ${a.commentReply}`);

  const logs = res.logs || [];
  if (logs.length) {
    console.log('');
    heading(`Last ${logs.length} triggers`);
    table(
      ['when', 'who', 'comment', 'dm', 'reply'],
      logs.map((l) => [
        new Date(l.createdAt).toLocaleString(),
        truncate(l.commenterName || l.commenterId, 18),
        truncate(l.commentText, 26),
        l.status === 'sent' ? c.green('sent') : l.status === 'failed' ? c.red('failed') : c.dim(l.status),
        l.commentReplyStatus || '—',
      ])
    );
  }
  console.log('');
};

commands.edit = async ({ positional, flags }) => {
  const id = positional[0];
  if (!id) throw new Error('Usage: autodm edit <automationId> [flags]');
  const z = client();

  const patch = {};
  if (flags.name) patch.name = flags.name;
  if (flags.keyword) patch.keywords = list(flags.keyword);
  if (flags.match) patch.matchMode = flags.match;
  if (flags.dm) patch.dmMessage = flags.dm;
  if (flags.button) patch.buttons = parseButtons(flags.button);
  if (flags['clear-buttons']) patch.buttons = [];
  if (flags.reply) patch.commentReply = flags.reply;
  if (flags['dm-variation']) patch.dmMessageVariations = String(flags['dm-variation']).split(';;');
  if (flags['reply-variation']) patch.commentReplyVariations = String(flags['reply-variation']).split(';;');
  if (flags['click-tag']) patch.clickTag = flags['click-tag'];
  if (flags['no-tracking']) patch.linkTracking = false;

  if (Object.keys(patch).length === 0) throw new Error('Nothing to change. Pass at least one flag — see `autodm help`.');

  // The 640-char cap depends on buttons, so validate against the merged result.
  const current = (await z.getAutomation(id)).automation || {};
  validateAutomation(
    { ...current, ...patch, profileId: 'x', accountId: 'x' },
    { platform: current.platform || 'instagram' }
  );

  const res = await z.updateAutomation(id, patch);
  if (flags.json) return json(res);
  ok(`Updated "${res.automation?.name || id}"`);
  for (const w of lintAutomation({ ...current, ...patch })) warn(w);
};

const setActive = (isActive, verb) => async ({ positional, flags }) => {
  const id = positional[0];
  if (!id) throw new Error(`Usage: autodm ${verb} <automationId>`);
  const res = await client().updateAutomation(id, { isActive });
  if (flags.json) return json(res);
  ok(`${verb === 'pause' ? 'Paused' : 'Resumed'} "${res.automation?.name || id}"${isActive ? '' : ' — stats and logs are kept'}`);
};
commands.pause = setActive(false, 'pause');
commands.resume = setActive(true, 'resume');

commands.rm = async ({ positional, flags }) => {
  const id = positional[0];
  if (!id) throw new Error('Usage: autodm rm <automationId>');
  const z = client();
  const a = (await z.getAutomation(id)).automation || {};
  if (!flags.yes && !flags.json) {
    warn(`This deletes "${a.name}" and all ${a.stats?.totalTriggered ?? 0} of its trigger logs. Pausing keeps them.`);
    if (!(await confirm('Delete anyway?'))) return info('Cancelled.');
  }
  await z.deleteAutomation(id);
  if (flags.json) return json({ ok: true, deleted: id });
  ok(`Deleted "${a.name}"`);
};

commands.logs = async ({ positional, flags }) => {
  const id = positional[0];
  if (!id) throw new Error('Usage: autodm logs <automationId> [--status sent|failed|skipped]');
  const z = client();
  const res = await z.automationLogs(id, { status: flags.status, limit: flags.limit || 50 });
  if (flags.json) return json(res);
  heading('Trigger log');
  table(
    ['when', 'who', 'comment', 'dm', 'error'],
    (res.logs || []).map((l) => [
      new Date(l.createdAt).toLocaleString(),
      truncate(l.commenterName || l.commenterId, 18),
      truncate(l.commentText, 30),
      l.status === 'sent' ? c.green('sent') : l.status === 'failed' ? c.red('failed') : c.dim(l.status),
      truncate(l.error || l.commentReplyError || '', 30),
    ])
  );
  if (res.pagination?.hasMore) info(c.dim(`\n  ${res.pagination.total} total — pass --limit to see more`));
};

commands.stats = async ({ flags }) => {
  const z = client();
  const cfg = readConfig();
  const { automations = [] } = await z.listAutomations(flags.profile || cfg.profileId);
  if (flags.json) return json(automations.map((a) => ({ id: a.id, name: a.name, stats: a.stats })));

  heading('Scoreboard');
  table(
    ['name', 'triggered', 'sent', 'failed', 'read', 'clicks', 'CTR'],
    automations.map((a) => {
      const s = a.stats || {};
      return [
        truncate(a.name, 24),
        s.triggered ?? 0,
        s.dmsSent ?? 0,
        s.dmsFailed ? c.red(s.dmsFailed) : 0,
        s.read ?? '—',
        s.uniqueClicks ?? 0,
        ctr(s),
      ];
    })
  );
  console.log(
    c.dim('\n  CTR = unique clicks ÷ trackable sends. Instagram sends no delivery receipt, so "read" is the closest\n  thing to delivery confirmation you get.\n')
  );
};

commands.templates = async ({ flags }) => {
  const dir = join(ROOT, 'templates');
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  const items = files.map((f) => {
    const t = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    return { name: f.replace('.json', ''), title: t.name, description: t._description || '', keywords: t.keywords };
  });
  if (flags.json) return json(items);
  heading('Templates');
  for (const t of items) {
    console.log(`  ${c.bold(t.name)}`);
    console.log(`    ${t.description}`);
    console.log(c.dim(`    node bin/autodm.mjs new --template ${t.name} --dm "..." --button "Label|https://..."\n`));
  }
};

// ── comments ──────────────────────────────────────────────────────────────

commands.posts = async ({ flags }) => {
  const z = client();
  const cfg = readConfig();
  const res = await z.listCommentedPosts({
    profileId: flags.profile || cfg.profileId,
    platform: platformOf(flags),
    limit: flags.limit || 20,
    sortBy: flags.sort || 'date',
  });
  if (flags.json) return json(res);
  heading('Recent posts');
  table(
    ['post id', 'when', 'comments', 'caption'],
    (res.data || []).map((p) => [
      p.id,
      new Date(p.createdTime).toLocaleDateString(),
      p.commentCount,
      truncate(p.content, 42),
    ])
  );
  info(c.dim('\n  Use a post id with: new --post <post id>\n'));
};

commands.comments = async ({ positional, flags }) => {
  const postId = positional[0];
  if (!postId) throw new Error('Usage: autodm comments <postId>');
  const z = client();
  const { accountId } = await resolveContext(z, flags);
  const res = await z.getComments(postId, { accountId, limit: flags.limit || 25 });
  if (flags.json) return json(res);
  heading('Comments');
  table(
    ['comment id', 'from', 'text', 'likes', 'hidden'],
    (res.comments || []).map((cm) => [
      cm.id,
      truncate(cm.from?.username || cm.from?.name, 18),
      truncate(cm.message, 40),
      cm.likeCount ?? 0,
      cm.isHidden ? 'yes' : '',
    ])
  );
};

commands.reply = async ({ positional, flags }) => {
  const postId = positional[0];
  if (!postId || !flags.message) throw new Error('Usage: autodm reply <postId> --message "..." [--comment <commentId>]');
  const z = client();
  const { accountId } = await resolveContext(z, flags);
  const res = await z.replyToComment(postId, {
    accountId,
    message: flags.message,
    commentId: flags.comment,
  });
  if (flags.json) return json(res);
  ok(`Replied${flags.comment ? ' to the comment' : ' on the post'} · id ${res.data?.commentId}`);
};

commands.hide = async ({ positional, flags }) => {
  const [postId, commentId] = positional;
  if (!postId || !commentId) throw new Error('Usage: autodm hide <postId> <commentId> [--unhide]');
  const z = client();
  const { accountId } = await resolveContext(z, flags);
  const res = await z.hideComment(postId, commentId, { accountId, hide: !flags.unhide });
  if (flags.json) return json(res);
  ok(flags.unhide ? 'Comment unhidden' : 'Comment hidden');
};

commands.dm = async ({ positional, flags }) => {
  const [postId, commentId] = positional;
  if (!postId || !commentId) {
    throw new Error('Usage: autodm dm <postId> <commentId> --message "..." [--button "Label|https://..."]');
  }
  if (!flags.message) throw new Error('--message is required.');
  const z = client();
  const { accountId } = await resolveContext(z, flags);
  const body = { accountId, message: flags.message };
  const buttons = parseButtons(flags.button);
  if (buttons) body.buttons = buttons;
  const res = await z.privateReply(postId, commentId, body);
  if (flags.json) return json(res);
  ok(`Private reply sent · message ${res.messageId}`);
  info(c.dim(`One private reply per comment, within ${LIMITS.PRIVATE_REPLY_WINDOW_DAYS} days of it being posted.`));
};

// ── the Claude layer ──────────────────────────────────────────────────────

/**
 * Quotes a value for a copy-pasteable shell command. Multi-line DMs use ANSI-C
 * quoting ($'...\n...') so the command stays on one visual line and the newlines
 * survive the paste — bash and zsh both handle it.
 */
function shellQuote(value) {
  const s = String(value);
  if (!s.includes('\n')) return `"${s.replace(/(["\\$`])/g, '\\$1')}"`;
  return `$'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
}

commands.write = async ({ flags }) => {
  if (!flags.offer) {
    throw new Error(
      'Usage: autodm write --offer "the free guide to X" --link https://... [--keyword GUIDE] [--caption "..."]'
    );
  }
  const keyword = (flags.keyword || 'GUIDE').toUpperCase();
  const draft = await writeDm({
    offer: flags.offer,
    link: flags.link || 'https://your-link.com',
    caption: flags.caption,
    keyword,
    platform: platformOf(flags),
  });

  const command = [
    'node bin/autodm.mjs new',
    `--name ${shellQuote(flags.name || flags.offer.slice(0, 40))}`,
    `--keyword ${keyword}`,
    `--dm ${shellQuote(draft.dm)}`,
    `--button ${shellQuote(`${draft.buttonLabel}|${flags.link || 'https://your-link.com'}`)}`,
    `--reply ${shellQuote(draft.commentReply)}`,
    flags.post ? `--post ${flags.post}` : '',
    platformOf(flags) === 'facebook' ? '--platform facebook' : '',
  ].filter(Boolean).join(' \\\n  ');

  if (flags.json) return json({ ...draft, keyword, command });

  heading('Draft');
  info(c.dim(draft.source === 'claude' ? 'Written by Claude' : 'Written from a template — no logged-in `claude` CLI found'));
  console.log(`\n${c.dim('DM')}\n${draft.dm}\n`);
  console.log(`${c.dim('Button')}\n[ ${draft.buttonLabel} ] → ${flags.link || 'https://your-link.com'}\n`);
  console.log(`${c.dim('Public reply')}\n${draft.commentReply}${draft.replyVariations?.length ? c.dim(`  (+${draft.replyVariations.length} variations)`) : ''}\n`);
  if (draft.note) info(c.dim(draft.note));

  console.log(`\n${c.dim('Create it with:')}\n\n${command}\n`);

  if (flags.create) {
    const merged = {
      ...flags,
      name: flags.name || flags.offer.slice(0, 40),
      keyword,
      dm: draft.dm,
      button: `${draft.buttonLabel}|${flags.link || 'https://your-link.com'}`,
      reply: draft.commentReply,
      'reply-variation': (draft.replyVariations || []).join(';;') || undefined,
      'dm-variation': (draft.dmVariations || []).join(';;') || undefined,
    };
    delete merged.create;
    await commands.new({ flags: merged });
  }
};

/** Shared by `triage` and `answer`. */
async function triagePost(z, postId, flags) {
  const { accountId } = await resolveContext(z, flags);
  const res = await z.getComments(postId, { accountId, limit: flags.limit || 25 });
  const comments = (res.comments || []).filter((cm) => !cm.from?.isOwner);
  const verdicts = await triage({
    comments,
    context: flags.context,
    handle: readConfig().accountUsername,
  });
  return { accountId, comments, verdicts };
}

const CATEGORY_COLOR = {
  'buying-signal': c.green,
  question: c.cyan,
  praise: c.dim,
  spam: c.yellow,
  negative: c.red,
  other: c.dim,
};

commands.triage = async ({ positional, flags }) => {
  const postId = positional[0];
  if (!postId) throw new Error('Usage: autodm triage <postId> [--context "what the post is about"]');
  const z = client();
  const { comments, verdicts } = await triagePost(z, postId, flags);

  if (flags.json) {
    return json(
      verdicts.map((v) => ({
        ...v,
        commentId: comments[v.index]?.id,
        from: comments[v.index]?.from?.username,
        text: comments[v.index]?.message,
        autoReplySafe: isAutoReplySafe(v),
      }))
    );
  }

  heading('Comment triage');
  info(c.dim(verdicts[0]?.source === 'claude' ? 'Read by Claude' : 'Read by keyword rules — no logged-in `claude` CLI found'));
  console.log('');
  table(
    ['from', 'comment', 'read as', 'drafted reply', 'auto?'],
    verdicts.map((v) => {
      const cm = comments[v.index] || {};
      const paint = CATEGORY_COLOR[v.category] || ((s) => s);
      return [
        truncate(cm.from?.username || cm.from?.name, 14),
        truncate(cm.message, 30),
        paint(v.category),
        truncate(v.reply || c.dim('—'), 30),
        isAutoReplySafe(v) ? c.green('yes') : c.dim('no'),
      ];
    })
  );
  const dmWorthy = verdicts.filter((v) => v.dmWorthy).length;
  console.log('');
  if (dmWorthy) info(`${dmWorthy} comment(s) worth a personal DM — see \`autodm dm\` in help.`);
  info(c.dim('Nothing was posted. `autodm answer <postId>` posts the safe ones.\n'));
};

commands.answer = async ({ positional, flags }) => {
  const postId = positional[0];
  if (!postId) throw new Error('Usage: autodm answer <postId> [--send] [--context "..."]');
  const z = client();
  const { accountId, comments, verdicts } = await triagePost(z, postId, flags);

  const safe = verdicts.filter(isAutoReplySafe);
  const held = verdicts.filter((v) => !isAutoReplySafe(v) && v.reply);

  if (!flags.send) {
    if (flags.json) return json({ wouldPost: safe.length, held: held.length, safe, held });
    heading('Ready to post');
    if (safe.length === 0) {
      info('Nothing passed the safety bar. Run `autodm triage` to see everything.\n');
      return;
    }
    for (const v of safe) {
      const cm = comments[v.index] || {};
      console.log(`  ${c.dim('@' + (cm.from?.username || '?'))}: ${truncate(cm.message, 50)}`);
      console.log(`  ${c.green('→')} ${v.reply}\n`);
    }
    if (held.length) info(c.dim(`${held.length} more drafted but held back (low confidence, spam, or negative).`));
    info(`\n  Add ${c.bold('--send')} to post these ${safe.length} replies publicly.\n`);
    return;
  }

  if (!flags.yes && !flags.json && !(await confirm(`Post ${safe.length} public replies?`))) {
    return info('Cancelled. Nothing posted.');
  }

  const posted = [];
  for (const v of safe) {
    const cm = comments[v.index];
    try {
      await z.replyToComment(postId, { accountId, message: v.reply, commentId: cm.id });
      posted.push({ commentId: cm.id, reply: v.reply, ok: true });
    } catch (err) {
      posted.push({ commentId: cm.id, reply: v.reply, ok: false, error: err.message });
    }
  }

  if (flags.json) return json({ posted, held: held.length });
  heading('Posted');
  for (const p of posted) {
    if (p.ok) ok(truncate(p.reply, 60));
    else fail(`${truncate(p.reply, 40)} — ${p.error}`);
  }
  if (held.length) info(c.dim(`\n  ${held.length} held back for you to handle personally.\n`));
};

// ── Instagram DM extras ───────────────────────────────────────────────────

commands.icebreakers = async ({ positional, flags }) => {
  const z = client();
  const { accountId, platform } = await resolveContext(z, flags);
  if (platform !== 'instagram') {
    throw new Error(
      'Ice breakers are an Instagram feature. The Facebook equivalent is the Messenger persistent menu, which this CLI does not set.'
    );
  }

  if (positional[0] === 'set') {
    if (!flags.q) throw new Error('Usage: autodm icebreakers set --q "Question|PAYLOAD;;Another|PAYLOAD2"');
    const iceBreakers = String(flags.q).split(';;').map((spec) => {
      const [question, payload] = spec.split('|').map((s) => s.trim());
      return { question, payload: payload || question.toUpperCase().replace(/\s+/g, '_') };
    });
    validateIceBreakers(iceBreakers);
    const res = await z.setIceBreakers(accountId, iceBreakers);
    if (flags.json) return json(res);
    ok(`Set ${iceBreakers.length} ice breaker(s) on your Instagram DM screen`);
    return;
  }
  if (positional[0] === 'clear') {
    await z.deleteIceBreakers(accountId);
    return ok('Ice breakers removed');
  }

  const res = await z.getIceBreakers(accountId);
  if (flags.json) return json(res);
  heading('Ice breakers');
  info(c.dim('The tappable FAQ shown to someone opening your DMs for the first time.\n'));
  const items = res.data?.[0]?.ice_breakers || res.data || [];
  table(['question', 'payload'], items.map((i) => [i.question, i.payload]));
};

commands.contacts = async ({ flags }) => {
  const z = client();
  const cfg = readConfig();
  const res = await z.listContacts({
    profileId: flags.profile || cfg.profileId,
    platform: 'instagram',
    tag: flags.tag,
    limit: flags.limit || 25,
  });
  if (flags.json) return json(res);
  heading('Contacts');
  info(c.dim('Everyone who triggered an automation lands here automatically.\n'));
  table(
    ['name', 'tags', 'sent', 'received', 'last DM'],
    (res.contacts || []).map((ct) => [
      truncate(ct.name || ct.displayIdentifier, 22),
      truncate((ct.tags || []).join(','), 20),
      ct.messagesSentCount ?? 0,
      ct.messagesReceivedCount ?? 0,
      ct.lastMessageSentAt ? new Date(ct.lastMessageSentAt).toLocaleDateString() : '—',
    ])
  );
  if (res.filters?.tags?.length) info(c.dim(`\n  Tags in use: ${res.filters.tags.join(', ')}\n`));
};

commands.webhook = async ({ positional, flags }) => {
  const z = client();
  if (positional[0] === 'add') {
    if (!flags.url) throw new Error('Usage: autodm webhook add --url https://... [--events comment.received,message.received]');
    const events = list(flags.events) || ['comment.received', 'message.received'];
    const res = await z.createWebhook({
      name: flags.name || 'AutoDM Kit',
      url: flags.url,
      events,
      secret: flags.secret,
    });
    if (flags.json) return json(res);
    ok(`Webhook created for: ${events.join(', ')}`);
    return;
  }
  const res = await z.listWebhooks();
  if (flags.json) return json(res);
  heading('Webhooks');
  table(
    ['name', 'url', 'events', 'active'],
    (res.webhooks || []).map((w) => [
      truncate(w.name, 20),
      truncate(w.url, 34),
      truncate((w.events || []).join(','), 30),
      w.isActive ? 'yes' : 'no',
    ])
  );
};

// ── entry point ───────────────────────────────────────────────────────────

const { positional, flags } = parseArgs(process.argv.slice(2));
const name = positional.shift() || 'help';
const command = commands[name];

if (!command) {
  fail(`Unknown command "${name}"`);
  commands.help();
  process.exit(1);
}

try {
  await command({ positional, flags });
} catch (err) {
  if (flags.json) {
    json({ ok: false, error: err.message, ...(err.problems ? { problems: err.problems } : {}) });
  } else {
    console.log('');
    fail(err.message);
    if (err instanceof ZernioError && err.status) info(c.dim(`HTTP ${err.status} · ${err.path || ''}`));
    console.log('');
  }
  process.exit(1);
}
