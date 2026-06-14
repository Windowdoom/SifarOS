// rules-loader.js — loads the rules layer and composes each jurisdiction.
//
// This is the ONLY bridge between the rules layer (/rules/*.json, pure data) and
// the reasoning layer. It reads the registry, deep-merges each jurisdiction's
// compose chain (federal -> common -> state), caches the result, and hands the
// merged ruleset to the rest of the server. It contains no eligibility numbers.

import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RULES_DIR = join(__dirname, "..", "rules");

let _index = null;
const _mergedCache = new Map();

function isPlainObject(x) {
  return x && typeof x === "object" && !Array.isArray(x);
}

/** Deep merge: objects merge recursively; arrays and scalars are replaced by `b`. */
function deepMerge(a, b) {
  if (!isPlainObject(a) || !isPlainObject(b)) return b === undefined ? a : b;
  const out = { ...a };
  for (const k of Object.keys(b)) {
    out[k] = isPlainObject(a[k]) && isPlainObject(b[k]) ? deepMerge(a[k], b[k]) : b[k];
  }
  return out;
}

async function readJson(file) {
  const raw = await readFile(join(RULES_DIR, file), "utf8");
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(`Invalid JSON in rules/${file}: ${e.message}`);
  }
}

export async function getIndex() {
  if (_index) return _index;
  _index = await readJson("_index.json");
  return _index;
}

export async function listJurisdictions() {
  const idx = await getIndex();
  return Object.entries(idx.jurisdictions).map(([code, j]) => ({
    code,
    displayName: j.displayName,
    programName: j.programName,
    country: j.country,
  }));
}

export async function getDefaultJurisdiction() {
  const idx = await getIndex();
  return idx.defaultJurisdiction || Object.keys(idx.jurisdictions)[0];
}

/** Compose and deep-merge a jurisdiction's rule files into one effective ruleset. */
export async function getMergedRules(code) {
  if (_mergedCache.has(code)) return _mergedCache.get(code);
  const idx = await getIndex();
  const j = idx.jurisdictions[code];
  if (!j) throw new Error(`Unknown jurisdiction: ${code}`);
  let merged = {};
  for (const file of j.compose) {
    merged = deepMerge(merged, await readJson(file));
  }
  // Stamp the active jurisdiction code so downstream code knows what it's serving.
  merged.jurisdiction = deepMerge(merged.jurisdiction || {}, { code });
  _mergedCache.set(code, merged);
  return merged;
}

/**
 * Count how many concrete values in a jurisdiction are still verified:false.
 * Used to drive the "unofficial estimate" labeling in the app.
 */
export function countUnverified(rules) {
  let total = 0;
  let unverified = 0;
  const walk = (node) => {
    if (!node || typeof node !== "object") return;
    if (Object.prototype.hasOwnProperty.call(node, "verified")) {
      total += 1;
      if (node.verified !== true) unverified += 1;
    }
    for (const v of Object.values(node)) {
      if (v && typeof v === "object") walk(v);
    }
  };
  walk(rules);
  return { total, unverified, allVerified: total > 0 && unverified === 0 };
}

/** Clear caches (used by tests / hot-reload of rules during development). */
export function clearCache() {
  _index = null;
  _mergedCache.clear();
}

export async function ruleFilesPresent() {
  const files = await readdir(RULES_DIR);
  return files.filter((f) => f.endsWith(".json"));
}
