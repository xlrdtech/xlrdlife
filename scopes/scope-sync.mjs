#!/usr/bin/env node
/**
 * scope-sync.mjs — keeps hitthe.link's scope registry (scopes.json) auto-synced
 * with the live deploy tree, so shipped app subpages never drift out of the
 * fulfillment registry again.
 *
 * Canon: the registry is a PROJECTION of what actually ships, never hand-maintained.
 * This script is the projector. It is idempotent — running it twice adds nothing
 * the second time.
 *
 * What it does:
 *   1. Loads scopes.json.
 *   2. Scans the deploy tree for every valid app dir (has index.html, not excluded).
 *   3. For each dir NOT already represented as a fulfillment FULFILL-<dir> entry
 *      (and not already a curated/conversational scopeID), builds a fulfillment record.
 *   4. Appends new records, sorts fulfillment by scopeID, recomputes meta.counts,
 *      sets meta.generated = SYNC_TS.
 *   5. Writes back atomically (tmp + rename), preserving 2-space indentation.
 *   6. Prints a summary.
 *
 * Timestamp policy (deliberate, per build spec): NEVER call Date.now() blindly.
 *   - Uses env SYNC_TS if provided (an ISO-8601 string).
 *   - Otherwise falls back to the deploy tree's own mtime as an ISO string,
 *     so re-runs are deterministic w.r.t. the filesystem, not wall-clock.
 *
 * Usage:
 *   SYNC_TS="2026-07-22T04:00:00-04:00" node scope-sync.mjs
 *   node scope-sync.mjs            # falls back to deploy-dir mtime
 */

import fs from 'node:fs';
import path from 'node:path';

// ---- Paths (absolute; canonical M4 tree) ---------------------------------
const SCOPES_JSON = '/Volumes/M4/sync_/exedus/dev_/code/hitthe.link/scopes/scopes.json';
const DEPLOY_DIR  = '/Volumes/M4/sync_/exedus/dev_/xen/.deploy/hitthe.link';

// Dirs that are never app subpages even if they happen to contain an index.html.
const EXCLUDE_NAMES = new Set([
  'assets', 'lib', 'cache', 'css', 'github_logo', '.github', 'scopes',
]);

// ---- Timestamp resolution -------------------------------------------------
function resolveSyncTs() {
  if (process.env.SYNC_TS && process.env.SYNC_TS.trim()) {
    return process.env.SYNC_TS.trim();
  }
  // Fallback: deploy dir mtime as an ISO string (deterministic, not wall-clock).
  try {
    const st = fs.statSync(DEPLOY_DIR);
    return st.mtime.toISOString();
  } catch {
    // Last resort only if the deploy dir can't be stat'd.
    return new Date(0).toISOString();
  }
}

// ---- Title extraction -----------------------------------------------------
// Pull <title>…</title> from an index.html, then strip common site-suffix noise.
function extractTitle(indexPath, dirName) {
  let html;
  try {
    html = fs.readFileSync(indexPath, 'utf8');
  } catch {
    return dirName;
  }
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return dirName;

  let title = m[1];
  // Decode a handful of common HTML entities so names read cleanly.
  title = title
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&nbsp;/g, ' ');
  // Collapse whitespace/newlines.
  title = title.replace(/\s+/g, ' ').trim();

  // Strip trailing site-suffix noise: "… | hitthe.link", "… — hitthe.link",
  // "… - Hit The Link", "… · XLRD", etc. Only strip the suffix, keep the name.
  const suffixRe = /\s*[|—–\-·:]\s*(hit\s*the\s*link|hitthe\.link|hitthelink|xlrd(\s*tech)?|self\s*exec|xen)\s*$/i;
  // Apply up to twice (handles "Name | XLRD | hitthe.link").
  for (let i = 0; i < 2; i++) {
    const stripped = title.replace(suffixRe, '').trim();
    if (stripped === title) break;
    title = stripped;
  }

  if (!title) return dirName;
  return title;
}

// ---- Category inference ---------------------------------------------------
// Infer a category from title + dirname keywords. First match wins.
function inferCategory(name, dirName) {
  const hay = `${name} ${dirName}`.toLowerCase();
  const has = (...kws) => kws.some((k) => hay.includes(k));

  if (has('xen', 'vvs', 'veinom', 'voice')) return 'Xen / Voice OS';
  if (has('l7s', 'business', 'exec', 'self-exec', 'selfexec', 'hero')) return 'Business & L7S';
  if (has('calc', 'price')) return 'Tools & Calculators';
  if (has('studio', 'music', 'mb', 'stal')) return 'Music & Studio';
  if (has('church', 'site', 'allendale', 'barnlights', 'temple', 'templ')) return 'Client Sites';
  return 'Builds & Apps';
}

// ---- Deploy-tree scan -----------------------------------------------------
function scanValidAppDirs() {
  const entries = fs.readdirSync(DEPLOY_DIR, { withFileTypes: true });
  const dirs = [];
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const name = ent.name;
    if (name.startsWith('.') || name.startsWith('_')) continue;
    if (EXCLUDE_NAMES.has(name)) continue;
    const indexPath = path.join(DEPLOY_DIR, name, 'index.html');
    if (!fs.existsSync(indexPath)) continue;
    dirs.push({ name, indexPath });
  }
  dirs.sort((a, b) => a.name.localeCompare(b.name));
  return dirs;
}

// ---- Main -----------------------------------------------------------------
function main() {
  const syncTs = resolveSyncTs();

  const raw = fs.readFileSync(SCOPES_JSON, 'utf8');
  const data = JSON.parse(raw);

  data.meta = data.meta || {};
  data.curated = Array.isArray(data.curated) ? data.curated : [];
  data.fulfillment = Array.isArray(data.fulfillment) ? data.fulfillment : [];
  data.conversational = Array.isArray(data.conversational) ? data.conversational : [];

  // Build the set of dirs already covered.
  //  - fulfillment: FULFILL-<dir> -> <dir> (lowercased)
  //  - curated/conversational: bare scopeID (lowercased), so a dir named "dcz"
  //    that already exists as curated "DCZ" is treated as covered.
  const coveredFulfillDirs = new Set();
  for (const e of data.fulfillment) {
    const sid = String(e.scopeID || '');
    if (sid.startsWith('FULFILL-')) {
      coveredFulfillDirs.add(sid.slice('FULFILL-'.length).toLowerCase());
    }
  }
  const otherScopeIds = new Set();
  for (const list of [data.curated, data.conversational]) {
    for (const e of list) otherScopeIds.add(String(e.scopeID || '').toLowerCase());
  }

  const validDirs = scanValidAppDirs();

  const added = [];
  for (const { name, indexPath } of validDirs) {
    const lc = name.toLowerCase();
    if (coveredFulfillDirs.has(lc)) continue;   // already a FULFILL- entry
    if (otherScopeIds.has(lc)) continue;        // already curated/conversational

    const title = extractTitle(indexPath, name);
    const record = {
      scopeID: `FULFILL-${name}`,
      name: title,
      category: inferCategory(title, name),
      url: `https://hitthe.link/${name}/`,
      status: 'shipped-live',
      updated: syncTs,
      dueClient: false,
    };
    data.fulfillment.push(record);
    added.push(record.scopeID);
    // Guard against a dir appearing twice in one run.
    coveredFulfillDirs.add(lc);
  }

  // Sort fulfillment by scopeID for stable, reviewable output.
  // Use raw codepoint comparison (NOT localeCompare) so ordering is
  // deterministic and matches a plain byte sort — locale-aware collation
  // reorders hyphens/case unpredictably across platforms.
  data.fulfillment.sort((a, b) => {
    const x = String(a.scopeID), y = String(b.scopeID);
    return x < y ? -1 : x > y ? 1 : 0;
  });

  // Recompute counts. Preserve any extra count keys (e.g. conversational_universe)
  // that this projector cannot derive; only update the ones we can.
  data.meta.counts = data.meta.counts || {};
  data.meta.counts.curated = data.curated.length;
  data.meta.counts.fulfillment = data.fulfillment.length;
  data.meta.counts.conversational = data.conversational.length;
  data.meta.counts.total =
    data.curated.length + data.fulfillment.length + data.conversational.length;

  data.meta.generated = syncTs;

  // Atomic write: tmp then rename. 2-space indent, trailing newline.
  const out = JSON.stringify(data, null, 2) + '\n';
  const tmp = `${SCOPES_JSON}.tmp`;
  fs.writeFileSync(tmp, out, 'utf8');
  fs.renameSync(tmp, SCOPES_JSON);

  // Summary.
  console.log('[scope-sync] SYNC_TS          =', syncTs);
  console.log('[scope-sync] valid app dirs   =', validDirs.length);
  console.log('[scope-sync] added            =', added.length);
  console.log('[scope-sync] fulfillment total=', data.fulfillment.length);
  console.log('[scope-sync] grand total      =', data.meta.counts.total);
  if (added.length) {
    console.log('[scope-sync] added scopeIDs:');
    for (const id of added) console.log('   ', id);
  } else {
    console.log('[scope-sync] no new scopes — registry already in sync.');
  }
}

main();
