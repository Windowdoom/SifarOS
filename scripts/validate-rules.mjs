// validate-rules.mjs — enforces the provenance contract of the rules layer.
//
// FAILS the build (exit 1) if any concrete value (an object carrying a `verified`
// flag) is missing a `source`. WARNS if a financial value is missing an
// `effectiveDate`. Reports how many values per jurisdiction are still
// `verified: false` (expected for seed data; informational, not a failure).

import { listJurisdictions, getMergedRules } from "../server/rules-loader.js";

let errors = 0;
let warnings = 0;

function walk(node, path, acc) {
  if (!node || typeof node !== "object") return;
  if (Object.prototype.hasOwnProperty.call(node, "verified")) {
    acc.total += 1;
    if (node.verified !== true) acc.unverified += 1;
    if (!node.source) {
      console.error(`  ✗ ERROR ${path}: has "verified" but no "source"`);
      errors += 1;
    }
    const isFinancial =
      Object.prototype.hasOwnProperty.call(node, "value") ||
      Object.prototype.hasOwnProperty.call(node, "bySize");
    if (isFinancial && !node.effectiveDate) {
      console.warn(`  ! WARN  ${path}: financial value missing "effectiveDate"`);
      warnings += 1;
    }
  }
  for (const [k, v] of Object.entries(node)) {
    if (v && typeof v === "object") walk(v, `${path}.${k}`, acc);
  }
}

async function main() {
  const jurisdictions = await listJurisdictions();
  if (!jurisdictions.length) {
    console.error("No jurisdictions registered in rules/_index.json");
    process.exit(1);
  }
  console.log(`Validating ${jurisdictions.length} jurisdiction(s)...\n`);
  for (const j of jurisdictions) {
    const rules = await getMergedRules(j.code);
    const acc = { total: 0, unverified: 0 };
    console.log(`▶ ${j.code} — ${j.displayName} (${j.programName})`);
    walk(rules, j.code, acc);
    // sanity: the pieces the app depends on must exist
    const required = [
      ["eligibilityModel.grossMonthlyIncomeLimit.bySize", rules.eligibilityModel?.grossMonthlyIncomeLimit?.bySize],
      ["incomeStandards.netMonthlyIncomeLimit_100pctFPL.bySize", rules.incomeStandards?.netMonthlyIncomeLimit_100pctFPL?.bySize],
      ["maxAllotment.bySize", rules.maxAllotment?.bySize],
      ["channels.officialApplicationPortal", rules.channels?.officialApplicationPortal],
      ["channels.statewideInfoLine", rules.channels?.statewideInfoLine],
      ["applicationSteps.steps", rules.applicationSteps?.steps],
      ["interview", rules.interview],
      ["retention.recertification", rules.retention?.recertification],
    ];
    for (const [name, val] of required) {
      if (!val) {
        console.error(`  ✗ ERROR ${j.code}: missing required section "${name}"`);
        errors += 1;
      }
    }
    console.log(`  values with provenance: ${acc.total} | still verified:false: ${acc.unverified}\n`);
  }

  console.log("─".repeat(48));
  if (errors > 0) {
    console.error(`FAILED: ${errors} error(s), ${warnings} warning(s).`);
    process.exit(1);
  }
  console.log(`OK: provenance present on all values. ${warnings} warning(s).`);
  console.log("Note: verified:false is expected for seed data and must be confirmed by an operator before production use.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
