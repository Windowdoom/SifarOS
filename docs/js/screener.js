// screener.js — the deterministic eligibility estimator.
//
// This module is part of the REASONING LAYER. It contains NO eligibility numbers.
// Every threshold, deduction, allotment, and formula constant is read from the
// merged rules object passed in (the rules layer). It is a plain ES module with no
// DOM or Node dependencies, so the browser app and the Node server both import it
// and run the exact same math.
//
// It is intentionally conservative: it produces a *basic estimate*, biases toward
// "maybe" near thresholds, lowers confidence when inputs are incomplete, and always
// tells the person to confirm with the official channel and a human. It never
// claims certainty.

/** Look up a per-household-size value, extending past the table with the increment. */
export function lookupBySize(table, size) {
  if (!table || !table.bySize) return null;
  const keys = Object.keys(table.bySize).map(Number).filter((n) => !Number.isNaN(n));
  if (keys.length === 0) return null;
  const maxKey = Math.max(...keys);
  if (size <= maxKey) {
    const v = table.bySize[String(size)];
    return typeof v === "number" ? v : null;
  }
  const base = table.bySize[String(maxKey)];
  const inc = table.eachAdditionalPerson || 0;
  return base + (size - maxKey) * inc;
}

/** Standard deduction has a "sixOrMore" fallback. */
function standardDeductionForSize(stdDed, size) {
  if (!stdDed) return 0;
  if (size >= 6 && typeof stdDed.sixOrMore === "number") return stdDed.sixOrMore;
  const v = lookupBySize(stdDed, size);
  return typeof v === "number" ? v : (stdDed.sixOrMore || 0);
}

export function formatMoney(n) {
  if (n == null || Number.isNaN(n)) return "—";
  return "$" + Math.round(n).toLocaleString("en-US");
}

function num(x) {
  const n = typeof x === "string" ? parseFloat(x) : x;
  return Number.isFinite(n) ? n : 0;
}

/**
 * Estimate SNAP eligibility.
 * @param {object} rules  merged effective ruleset for the active jurisdiction
 * @param {object} p      household profile (all monthly USD unless noted)
 *   householdSize (int >=1, required)
 *   monthlyGrossIncome (number, required for a result)
 *   monthlyEarnedIncome (number, portion that is from work)
 *   monthlyShelterCost, monthlyUtilityCost, monthlyDependentCareCost
 *   hasElderlyOrDisabled (bool)
 *   sensitiveFlags (string[]) topic ids to route to a human
 * @returns {object} estimate
 */
export function screen(rules, p = {}) {
  const reasons = [];
  const disclaimers = [];
  const inputsMissing = [];
  const routeToHuman = Array.isArray(p.sensitiveFlags) ? [...p.sensitiveFlags] : [];

  const model = rules.eligibilityModel || {};
  const fed = rules.incomeStandards || {};
  const ded = rules.deductions || {};
  const formula = rules.benefitFormula || {};
  const stateName = (rules.jurisdiction && rules.jurisdiction.displayName) || "your state";
  const programName = (rules.jurisdiction && rules.jurisdiction.programName) || "SNAP";

  const size = parseInt(p.householdSize, 10);
  if (!Number.isFinite(size) || size < 1) {
    inputsMissing.push("householdSize");
  }
  const haveIncome = p.monthlyGrossIncome != null && p.monthlyGrossIncome !== "";
  if (!haveIncome) inputsMissing.push("monthlyGrossIncome");

  // Always-on disclaimer: this is an estimate, not a decision.
  disclaimers.push({
    en: `This is a basic estimate, not an official decision. Only ${stateName} can decide. The fastest way to know for sure is to apply — applying is free.`,
    es: `Esto es un cálculo básico, no una decisión oficial. Solo ${stateName} puede decidir. La forma más rápida de saberlo con certeza es solicitar: solicitar es gratis.`,
  });

  if (inputsMissing.length > 0) {
    return {
      decision: "unknown",
      confidence: "low",
      estimatedMonthlyBenefit: null,
      reasons: [
        {
          en: "I need a little more to estimate: how many people are in your household, and about how much money comes in each month.",
          es: "Necesito un poco más para calcular: cuántas personas hay en su hogar y aproximadamente cuánto dinero entra cada mes.",
        },
      ],
      disclaimers,
      routeToHuman,
      inputsMissing,
    };
  }

  // --- Pull thresholds from the rules layer (no hardcoded numbers) ---
  const grossLimit = lookupBySize(model.grossMonthlyIncomeLimit, size);
  const netLimitTable = fed.netMonthlyIncomeLimit_100pctFPL;
  const netLimit = lookupBySize(netLimitTable, size);
  const maxAllotment = lookupBySize(rules.maxAllotment, size);
  const stdDed = standardDeductionForSize(ded.standardDeduction, size);
  const earnedPct = (ded.earnedIncomeDeductionPct && ded.earnedIncomeDeductionPct.value) || 0;
  const shelterCap = (ded.maxExcessShelterDeduction && ded.maxExcessShelterDeduction.value) || Infinity;
  const netContribRate = (formula.netIncomeContributionRate && formula.netIncomeContributionRate.value) || 0.3;
  const shelterRate = (formula.shelterIncomeThresholdRate && formula.shelterIncomeThresholdRate.value) || 0.5;
  const minBenefitInfo = rules.minimumBenefit || {};

  const gross = num(p.monthlyGrossIncome);
  const earned = Math.min(num(p.monthlyEarnedIncome), gross); // earned can't exceed total
  const shelter = num(p.monthlyShelterCost);
  const utilities = num(p.monthlyUtilityCost);
  const depCare = num(p.monthlyDependentCareCost);
  const elderlyDisabled = !!p.hasElderlyOrDisabled;
  const haveExpenseInputs =
    p.monthlyShelterCost != null && p.monthlyShelterCost !== "";

  // --- Estimate net income (federal SNAP method, constants from rules) ---
  const earnedDeduction = earned * (earnedPct / 100);
  const incomeAfterOther = Math.max(0, gross - stdDed - earnedDeduction - depCare);
  let excessShelter = Math.max(0, shelter + utilities - shelterRate * incomeAfterOther);
  if (!elderlyDisabled && Number.isFinite(shelterCap)) {
    excessShelter = Math.min(excessShelter, shelterCap);
  }
  const estimatedNetIncome = Math.max(0, incomeAfterOther - excessShelter);

  // --- Apply the tests ---
  const grossTestApplies = !elderlyDisabled; // waived for elderly/disabled households
  const overGross = grossTestApplies && grossLimit != null && gross > grossLimit;
  const wayOverGross = grossTestApplies && grossLimit != null && gross > grossLimit * 1.15;
  const netPass = netLimit == null ? true : estimatedNetIncome <= netLimit;

  let decision, confidence;
  if (wayOverGross) {
    decision = "unlikely";
    confidence = "medium";
  } else if (overGross) {
    decision = "unlikely";
    confidence = "low";
  } else if (netPass) {
    decision = "likely";
    confidence = haveExpenseInputs ? "medium" : "low";
  } else {
    // Passes gross (or it's waived) but our rough net estimate is over the line.
    // Our net estimate omits some deductions (medical, child support paid, full
    // utility standard), so we stay cautious rather than discouraging.
    decision = "maybe";
    confidence = "low";
  }

  // --- Estimated benefit (only when there's a real chance) ---
  let estimatedMonthlyBenefit = null;
  if (decision === "likely" || decision === "maybe") {
    if (maxAllotment != null) {
      let b = Math.round(maxAllotment - netContribRate * estimatedNetIncome);
      const minApplies =
        Array.isArray(minBenefitInfo.appliesToHouseholdSizes) &&
        minBenefitInfo.appliesToHouseholdSizes.includes(size);
      if (b > 0 && b < (minBenefitInfo.value || 0) && minApplies) b = minBenefitInfo.value;
      estimatedMonthlyBenefit = Math.max(0, Math.min(b, maxAllotment));
    }
  }

  // --- Plain-language reasons (numbers come from the rules layer) ---
  if (decision === "likely") {
    if (grossTestApplies && grossLimit != null) {
      reasons.push({
        en: `In ${stateName}, a household of ${size} can usually earn up to about ${formatMoney(grossLimit)} a month (before taxes) and still get ${programName}. What you told me is at or below that.`,
        es: `En ${stateName}, un hogar de ${size} normalmente puede ganar hasta aproximadamente ${formatMoney(grossLimit)} al mes (antes de impuestos) y aún recibir ${programName}. Lo que me dijo está en o por debajo de eso.`,
      });
    } else if (elderlyDisabled) {
      reasons.push({
        en: `Because someone in your home is 60+ or has a disability, ${stateName} skips the higher income test and looks mainly at income after costs — and yours looks within the limit.`,
        es: `Como alguien en su hogar tiene 60+ o una discapacidad, ${stateName} omite la prueba de ingresos más alta y mira principalmente los ingresos después de costos, y los suyos parecen dentro del límite.`,
      });
    }
    if (estimatedMonthlyBenefit != null) {
      reasons.push({
        en: `A rough estimate of your monthly benefit is around ${formatMoney(estimatedMonthlyBenefit)}. The real amount depends on your exact costs.`,
        es: `Un cálculo aproximado de su beneficio mensual es alrededor de ${formatMoney(estimatedMonthlyBenefit)}. La cantidad real depende de sus costos exactos.`,
      });
    }
  } else if (decision === "maybe") {
    reasons.push({
      en: `You might qualify — you're near the line. Costs like rent, utilities, childcare, and (if anyone is 60+ or disabled) medical bills can lower the income that counts and help you qualify. It's worth applying.`,
      es: `Podría calificar: está cerca del límite. Costos como alquiler, servicios, cuidado de niños y (si alguien tiene 60+ o discapacidad) facturas médicas pueden reducir los ingresos que cuentan y ayudarle a calificar. Vale la pena solicitar.`,
    });
  } else if (decision === "unlikely") {
    if (grossLimit != null) {
      reasons.push({
        en: `Based on what you told me, your income looks above the limit for a household of ${size} in ${stateName} (about ${formatMoney(grossLimit)} a month before taxes). You may not qualify right now.`,
        es: `Según lo que me dijo, sus ingresos parecen por encima del límite para un hogar de ${size} en ${stateName} (aproximadamente ${formatMoney(grossLimit)} al mes antes de impuestos). Puede que no califique en este momento.`,
      });
    }
    reasons.push({
      en: `Things change. If your income drops, your household grows, or someone turns 60 or becomes disabled, check again — and a food bank can help today (dial 211).`,
      es: `Las cosas cambian. Si bajan sus ingresos, crece su hogar, o alguien cumple 60 años o queda con discapacidad, vuelva a revisar, y un banco de alimentos puede ayudar hoy (marque 211).`,
    });
  }

  // --- State-specific honesty: asset/savings test ---
  if (model.assetTest === true && model.assetTestNote) {
    disclaimers.push(model.assetTestNote);
  } else if (model.assetTest === "varies" && model.assetTestNote) {
    disclaimers.push(model.assetTestNote);
  }

  return {
    decision,
    confidence,
    estimatedMonthlyBenefit,
    grossLimit,
    netLimit,
    maxAllotment,
    estimatedNetIncome: Math.round(estimatedNetIncome),
    grossTestApplies,
    reasons,
    disclaimers,
    routeToHuman: [...new Set(routeToHuman)],
    inputsMissing,
  };
}
