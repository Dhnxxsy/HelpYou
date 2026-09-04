'use strict';

/**
 * Pure, dependency-free helpers for the update checker.
 * Kept in a separate module so they can be unit-tested with vitest.
 */

/** Extract the leading numeric version from a tag such as "v1.2.3" or "1.2.3-beta.1". */
function parseVersionTag(tag) {
  if (typeof tag !== 'string') return null;
  const m = tag.match(/\d+(?:\.\d+)*/);
  if (!m) return null;
  return m[0].split('.').map((s) => parseInt(s, 10));
}

/**
 * Compare two version strings (numeric parts only).
 * Returns 1 when a > b, -1 when a < b, 0 when equal or unparseable.
 */
function compareVersions(a, b) {
  const pa = parseVersionTag(a);
  const pb = parseVersionTag(b);
  if (!pa && !pb) return 0;
  if (!pa) return -1;
  if (!pb) return 1;
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

/** Extract { owner, repo } from a package.json repository field. */
function githubFromRepoField(value) {
  if (typeof value === 'string') {
    const m = value.match(/(?:github\.com[/:])?([^/\s:#]+)\/([^/\s.#]+)/);
    if (m) return { owner: m[1], repo: m[2] };
    const parts = value.split('/').filter(Boolean);
    if (parts.length >= 2) return { owner: parts[0], repo: parts[1] };
    return parts.length === 1 ? { owner: parts[0], repo: parts[0] } : null;
  }
  if (value && typeof value === 'object' && typeof value.url === 'string') {
    return githubFromRepoField(value.url);
  }
  return null;
}

/**
 * Resolve the update source.
 * Precedence: env vars > update-config.json > package.json repository field.
 * Returns { owner, repo, intervalHours }; empty owner/repo means "disabled".
 */
function resolveUpdateSource({ env = process.env, config = {}, packageJson = {} } = {}) {
  const intervalHours = Number(env.FO_UPDATE_INTERVAL_HOURS) || config.checkIntervalHours || 12;
  const owner = env.FO_UPDATE_OWNER || config.owner || '';
  const repo = env.FO_UPDATE_REPO || config.repo || '';
  const fromPkg = (owner && repo) ? null : githubFromRepoField(packageJson.repository);
  return {
    owner: owner || (fromPkg ? fromPkg.owner : ''),
    repo: repo || (fromPkg ? fromPkg.repo : ''),
    intervalHours,
  };
}

module.exports = { parseVersionTag, compareVersions, githubFromRepoField, resolveUpdateSource };