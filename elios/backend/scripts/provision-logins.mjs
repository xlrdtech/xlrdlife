/**
 * EliOS — one-command login provisioner (admin-create all 8 users)
 * =========================================================================
 * Reads the roster from ../roster.json, then for each user uses the Supabase
 * Admin API (service-role) to:
 *   1. ensure an auth.users row exists for that email (idempotent — detects and
 *      skips creation if the user already exists),
 *   2. stamp role in user_metadata ('master' for Anthony Vasquez + Gerald,
 *      'subscriber' for the other 6) AND full_name AND username,
 *   3. issue a credential for that user per the mode:
 *        - PASSWORD (DEFAULT, qi 2026-06-12 "make user names for now"):
 *            generates a 16-char random temp password, sets it on the user with
 *            email_confirm=true (so they can sign in immediately without
 *            receiving any mail), flags must_change_password in user_metadata,
 *            and PRINTS the password ONCE to stdout. Passwords are NEVER written
 *            to the repo or any file. roster.json declares this via
 *            "auth_mode_for_now": "password".
 *        - INVITE   (--mode=invite):  generateLink 'invite' (new) / 'recovery'
 *            (existing) — emails/links a set-password flow. Needs real mailboxes.
 *        - MAGICLINK (--mode=magiclink): passwordless one-time login link.
 *
 * Because the signup trigger handle_new_user() reads raw_user_meta_data.role
 * (supabase-schema.sql §16) + roster_seed, the buyers row is created with the
 * correct role automatically on user creation. This script ALSO re-stamps role
 * on existing rows via user_metadata so re-runs converge.
 *
 * PROVISIONING IN ONE STEP (password mode, runs now — usernames already filled):
 *   1. (roster.json emails are already filled with username@trackingtogether.com)
 *   2. Run with the service-role key in env — NEVER commit it:
 *        cd elios/backend
 *        SUPABASE_URL=https://<ref>.supabase.co \
 *        SUPABASE_SERVICE_ROLE_KEY=eyJ... \
 *        node scripts/provision-logins.mjs
 *      -> prints the 8 username/email + temp password pairs ONCE. Hand each
 *         person theirs out-of-band; they change it on first login.
 *   3. Apply the DB role model + RLS (authoritative file matching admin.html):
 *        run backend/supabase-schema.sql in the Supabase SQL editor. The signup
 *        trigger stamps role from the user_metadata this script set; you can
 *        also run the §17 email->role UPDATE to be explicit.
 *
 * MODE SELECTION:
 *   - Default mode is read from roster.json "auth_mode_for_now" (currently
 *     "password"); fall back to "password" if absent.
 *   - Override on the CLI:  --mode=password | --mode=invite | --mode=magiclink
 *   - --dry-run    print what WOULD happen; create/set nothing, no passwords.
 *
 * IDEMPOTENT: existing users are detected and skipped for creation (their role
 * metadata is re-stamped). In password mode a re-run RESETS the temp password
 * for an existing user (so you can recover a lost one) and prints the new value
 * — pass --no-reset-existing to leave existing users' passwords untouched.
 *
 * This is an OPERATOR script. It holds NO secrets in the repo: the service-role
 * key comes from the environment at run time only; temp passwords are random
 * and printed once, never persisted.
 *
 * Requires: Node 18+, @supabase/supabase-js (already in backend/package.json).
 *   cd backend && npm install   (once)
 */
import { createClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---- env (NEVER hard-code these) -------------------------------------------
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error(
    'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.\n' +
    '  cd elios/backend\n' +
    '  SUPABASE_URL=https://<ref>.supabase.co \\\n' +
    '  SUPABASE_SERVICE_ROLE_KEY=eyJ... \\\n' +
    '  node scripts/provision-logins.mjs'
  );
  process.exit(1);
}

// ---- args ------------------------------------------------------------------
const argv = process.argv.slice(2);
const MODE_ARG = (argv.find((a) => a.startsWith('--mode=')) || '').split('=')[1] || null;
const DRY_RUN = argv.includes('--dry-run');
const NO_RESET_EXISTING = argv.includes('--no-reset-existing');

// Where invite/magiclink users land (must be an allowed redirect URL in
// Supabase Auth > URL Configuration). Override with REDIRECT_TO if needed.
const REDIRECT_TO =
  process.env.REDIRECT_TO || 'https://tools.trackingtogether.com/elios/dashboard.html';

const db = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const EMAIL_PLACEHOLDER = /^<.*_email>$/; // matches the old roster.json slots

// 16-char URL-safe-ish random password (mixed classes), no ambiguous chars.
function genPassword() {
  const sets = {
    upper: 'ABCDEFGHJKMNPQRSTUVWXYZ',   // no I, O, L
    lower: 'abcdefghijkmnpqrstuvwxyz',   // no l
    digit: '23456789',                   // no 0, 1
    sym: '!@#$%^&*-_=+',
  };
  const all = sets.upper + sets.lower + sets.digit + sets.sym;
  const pick = (chars) => chars[randomBytes(1)[0] % chars.length];
  // Guarantee one of each class, then fill to 16, then shuffle.
  let out = [pick(sets.upper), pick(sets.lower), pick(sets.digit), pick(sets.sym)];
  while (out.length < 16) out.push(pick(all));
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomBytes(1)[0] % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.join('');
}

async function loadRoster() {
  const path = resolve(__dirname, '..', 'roster.json');
  const raw = JSON.parse(await readFile(path, 'utf8'));
  const users = Array.isArray(raw) ? raw : raw.users || [];
  if (!users.length) throw new Error('roster.json has no users[].');
  const unfilled = users.filter((u) => !u.email || EMAIL_PLACEHOLDER.test(u.email));
  if (unfilled.length) {
    console.error(
      `roster.json still has ${unfilled.length} unfilled email slot(s):\n` +
      unfilled.map((u) => `  - ${u.full_name} (${u.role}): ${u.email}`).join('\n') +
      '\nFill every email in elios/backend/roster.json, then re-run.'
    );
    process.exit(1);
  }
  for (const u of users) {
    if (!['master', 'subscriber'].includes(u.role)) {
      throw new Error(`roster.json: ${u.full_name} has invalid role "${u.role}".`);
    }
  }
  const defaultMode = (raw.auth_mode_for_now || 'password').toLowerCase();
  return {
    users: users.map((u) => ({ ...u, email: String(u.email).trim().toLowerCase() })),
    defaultMode,
  };
}

// Find an existing auth user by email (paginates listUsers; the project is tiny).
async function findUserByEmail(email) {
  let page = 1;
  while (true) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    const hit = (data.users || []).find((u) => (u.email || '').toLowerCase() === email);
    if (hit) return hit;
    if (!data.users || data.users.length < 1000) return null;
    page += 1;
  }
}

async function provisionPassword(u, existing) {
  const password = genPassword();
  const meta = { full_name: u.full_name, username: u.username || null, role: u.role, must_change_password: true };

  if (DRY_RUN) {
    console.log(`  [dry-run] ${existing ? 'RESET-pw' : 'CREATE+pw'}  ${u.email}  role=${u.role}  (password withheld in dry run)`);
    return { email: u.email, username: u.username, role: u.role, action: existing ? 'would-reset' : 'would-create', password: null };
  }

  if (existing) {
    if (NO_RESET_EXISTING) {
      const { error } = await db.auth.admin.updateUserById(existing.id, { user_metadata: { ...existing.user_metadata, ...meta } });
      if (error) console.warn(`  warn: metadata update ${u.email}: ${error.message}`);
      return { email: u.email, username: u.username, role: u.role, action: 'exists (pw kept)', password: null };
    }
    const { error } = await db.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      user_metadata: { ...existing.user_metadata, ...meta },
    });
    if (error) throw new Error(`updateUserById ${u.email}: ${error.message}`);
    return { email: u.email, username: u.username, role: u.role, action: 'reset', password };
  }

  const { error } = await db.auth.admin.createUser({
    email: u.email,
    password,
    email_confirm: true,   // confirmed so they can sign in immediately (no mail needed)
    user_metadata: meta,
  });
  if (error) throw new Error(`createUser ${u.email}: ${error.message}`);
  return { email: u.email, username: u.username, role: u.role, action: 'created', password };
}

async function provisionLink(u, existing, mode) {
  const meta = { full_name: u.full_name, username: u.username || null, role: u.role };

  if (DRY_RUN) {
    console.log(`  [dry-run] ${existing ? 'SKIP-create (exists)' : 'CREATE'} + ${mode} link  ${u.email}  role=${u.role}`);
    return { email: u.email, username: u.username, role: u.role, action: existing ? 'exists' : 'would-create', link: null };
  }

  let action;
  if (existing) {
    action = 'exists';
    const { error } = await db.auth.admin.updateUserById(existing.id, { user_metadata: { ...existing.user_metadata, ...meta } });
    if (error) console.warn(`  warn: metadata update ${u.email}: ${error.message}`);
  } else {
    const { error } = await db.auth.admin.createUser({ email: u.email, email_confirm: false, user_metadata: meta });
    if (error) throw new Error(`createUser ${u.email}: ${error.message}`);
    action = 'created';
  }

  const linkType = mode === 'magiclink' ? 'magiclink' : action === 'created' ? 'invite' : 'recovery';
  const { data, error } = await db.auth.admin.generateLink({ type: linkType, email: u.email, options: { redirectTo: REDIRECT_TO } });
  if (error) {
    console.warn(`  warn: generateLink(${linkType}) ${u.email}: ${error.message}`);
    return { email: u.email, username: u.username, role: u.role, action, link: null };
  }
  const link = data?.properties?.action_link || data?.action_link || null;
  return { email: u.email, username: u.username, role: u.role, action, linkType, link };
}

async function main() {
  const { users, defaultMode } = await loadRoster();
  const MODE = MODE_ARG || defaultMode;
  if (!['password', 'invite', 'magiclink'].includes(MODE)) {
    console.error(`Unknown mode "${MODE}". Use --mode=password | invite | magiclink.`);
    process.exit(1);
  }

  console.log(
    `EliOS provision-logins — mode=${MODE}${DRY_RUN ? ' (DRY RUN)' : ''} — ` +
    `${users.length} users (${users.filter((u) => u.role === 'master').length} master / ` +
    `${users.filter((u) => u.role === 'subscriber').length} subscriber)\n` +
    `Target: ${SUPABASE_URL}` + (MODE !== 'password' ? `   redirectTo: ${REDIRECT_TO}` : '') + '\n'
  );

  const results = [];
  for (const u of users) {
    try {
      const existing = await findUserByEmail(u.email);
      results.push(MODE === 'password' ? await provisionPassword(u, existing) : await provisionLink(u, existing, MODE));
    } catch (e) {
      console.error(`  ERROR ${u.email}: ${e.message}`);
      results.push({ email: u.email, username: u.username, role: u.role, action: 'error', error: e.message });
    }
  }

  if (MODE === 'password') {
    console.log('\n===== LOGIN CREDENTIALS (printed ONCE — not stored; hand out securely) =====');
    for (const r of results) {
      const tag = `${r.role.toUpperCase().padEnd(10)} ${(r.username || '').padEnd(9)} ${r.email.padEnd(34)} [${r.action}]`;
      if (r.password) console.log(`${tag}\n  password: ${r.password}\n`);
      else console.log(`${tag}${r.error ? '  — ' + r.error : ''}\n`);
    }
    console.log('Each user must change their password on first login (must_change_password flag set).');
  } else {
    console.log('\n===== LOGIN LINKS =====');
    for (const r of results) {
      const tag = `${r.role.toUpperCase().padEnd(10)} ${(r.username || '').padEnd(9)} ${r.email.padEnd(34)} [${r.action}${r.linkType ? '/' + r.linkType : ''}]`;
      if (r.link) console.log(`${tag}\n  ${r.link}\n`);
      else console.log(`${tag}\n  (no link${r.error ? ' — ' + r.error : ''})\n`);
    }
  }

  const created = results.filter((r) => r.action === 'created').length;
  const reset = results.filter((r) => r.action === 'reset').length;
  const existed = results.filter((r) => String(r.action).startsWith('exists')).length;
  const errored = results.filter((r) => r.action === 'error').length;
  console.log(
    `Summary: ${created} created` + (MODE === 'password' ? `, ${reset} pw-reset` : '') +
    `, ${existed} already existed, ${errored} errored.` +
    (DRY_RUN ? ' (dry run — nothing changed)' : '')
  );
  if (errored) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
