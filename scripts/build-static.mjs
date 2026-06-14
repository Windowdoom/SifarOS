// build-static.mjs — builds a server-free version of the Navigator into docs/
// for GitHub Pages.
//
// It copies the PWA from public/ and pre-renders the data the app would normally
// fetch from the API (/api/jurisdictions and /api/rules?j=CODE) into static
// docs/data/*.json files. The app fetches the API first and falls back to these,
// so the SAME app works both server-hosted (full, with the Claude model) and as a
// static site (on-device screener + guided questions + glossary; no model).

import { rm, mkdir, cp, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { listJurisdictions, getMergedRules, getDefaultJurisdiction, countUnverified } from "../server/rules-loader.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PUBLIC = join(ROOT, "public");
const OUT = join(ROOT, "docs");

// Drop developer-only keys (those starting with "_") to shrink the payload,
// matching what the server does on /api/rules.
function stripUnderscore(node) {
  if (Array.isArray(node)) return node.map(stripUnderscore);
  if (node && typeof node === "object") {
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      if (k.startsWith("_")) continue;
      out[k] = stripUnderscore(v);
    }
    return out;
  }
  return node;
}

async function main() {
  // Fresh output folder.
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  // 1) Copy the PWA shell + assets.
  await cp(PUBLIC, OUT, { recursive: true });

  // 2) Tell GitHub Pages not to run Jekyll (so files/folders serve as-is).
  await writeFile(join(OUT, ".nojekyll"), "");

  // 3) Pre-render the API responses as static JSON.
  const dataDir = join(OUT, "data");
  await mkdir(dataDir, { recursive: true });

  const jurisdictions = await listJurisdictions();
  const def = await getDefaultJurisdiction();
  await writeFile(join(dataDir, "jurisdictions.json"), JSON.stringify({ jurisdictions, default: def }));

  for (const j of jurisdictions) {
    const rules = await getMergedRules(j.code);
    const payload = {
      jurisdiction: j.code,
      verification: countUnverified(rules),
      modelAvailable: false,
      rules: stripUnderscore(rules),
    };
    await writeFile(join(dataDir, `rules-${j.code}.json`), JSON.stringify(payload));
  }

  console.log(`Built static site into docs/`);
  console.log(`  ${jurisdictions.length} jurisdictions: ${jurisdictions.map((j) => j.code).join(", ")}`);
  console.log(`Enable GitHub Pages: Settings -> Pages -> Deploy from a branch -> /docs`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
