// smoke.mjs — exercises the reasoning layer end-to-end without a browser or API key.
// Verifies the deterministic screener and the model-less fallbacks behave sanely
// for every registered jurisdiction. Exits non-zero on any failed assertion.

import { listJurisdictions, getMergedRules } from "../server/rules-loader.js";
import { screen } from "../public/js/screener.js";
import { runDiscovery } from "../server/reasoning/discovery.js";
import { runExplain } from "../server/reasoning/explain.js";

let failures = 0;
function assert(cond, msg) {
  if (cond) {
    console.log(`  ✓ ${msg}`);
  } else {
    console.error(`  ✗ ${msg}`);
    failures += 1;
  }
}

async function main() {
  const jurisdictions = await listJurisdictions();
  for (const j of jurisdictions) {
    console.log(`\n▶ ${j.code} — ${j.displayName}`);
    const rules = await getMergedRules(j.code);

    // 1) Clearly-eligible: single parent, 3 people, very low income.
    const low = screen(rules, { householdSize: 3, monthlyGrossIncome: 900, monthlyEarnedIncome: 900, monthlyShelterCost: 1200, monthlyUtilityCost: 200 });
    assert(low.decision === "likely", `low-income family of 3 -> likely (got ${low.decision})`);
    assert(low.estimatedMonthlyBenefit > 0, `low-income family has an estimated benefit (got ${low.estimatedMonthlyBenefit})`);

    // 2) Clearly-ineligible: 1 person, very high income.
    const high = screen(rules, { householdSize: 1, monthlyGrossIncome: 9000, monthlyEarnedIncome: 9000 });
    assert(high.decision === "unlikely", `single person at $9000/mo -> unlikely (got ${high.decision})`);

    // 3) Missing inputs -> unknown, never a guess.
    const unknown = screen(rules, { householdSize: 2 });
    assert(unknown.decision === "unknown", `missing income -> unknown (got ${unknown.decision})`);

    // 4) Every result carries the "this is an estimate" disclaimer.
    assert((low.disclaimers || []).length > 0, `result includes a disclaimer`);

    // 5) No eligibility numbers are invented: thresholds come from the rules layer.
    const grossLimit3 = rules.eligibilityModel.grossMonthlyIncomeLimit.bySize["3"];
    assert(low.grossLimit === grossLimit3, `gross limit comes from rules (${low.grossLimit} === ${grossLimit3})`);

    // 6) Discovery fallback (no API key) routes immigration questions to a human.
    const disc = await runDiscovery({ rules, profile: { householdSize: 4, monthlyGrossIncome: 1000, sensitiveFlags: ["immigration_status"] }, lang: "en" });
    assert(disc.routeToHumanCards.some((c) => c.topicId === "immigration_status"), `immigration flag -> route-to-human card`);
    assert(disc.usedModel === false, `discovery runs without the model`);

    // 7) Explain falls back to the bilingual glossary when the model is off.
    const ex = await runExplain({ rules, query: "gross income", lang: "es" });
    assert(ex.source === "glossary" && ex.text.length > 0, `explain falls back to glossary (source=${ex.source})`);

    // 8) Channels exist for the persistent help bar (official + phone).
    assert(!!rules.channels.officialApplicationPortal.url, `official application URL present`);
    assert(!!rules.channels.statewideInfoLine.phone, `helpline phone present`);
  }

  console.log("\n" + "─".repeat(48));
  if (failures > 0) {
    console.error(`SMOKE FAILED: ${failures} assertion(s) failed.`);
    process.exit(1);
  }
  console.log("SMOKE OK: all assertions passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
