// discovery.js — Job 1: map a person's words to a grounded eligibility picture.
//
// Flow: the model (if available) UNDERSTANDS the free text and extracts a
// structured profile + language + sensitive flags. The deterministic SCREENER then
// produces the eligibility estimate and every number from the rules layer. The
// model never decides eligibility, so it cannot fabricate a rule.

import { screen } from "../../public/js/screener.js";
import { callJson, isAvailable } from "../claude.js";
import { discoverySystem } from "./prompts.js";

const PROFILE_KEYS = [
  "householdSize",
  "monthlyGrossIncome",
  "monthlyEarnedIncome",
  "monthlyShelterCost",
  "monthlyUtilityCost",
  "monthlyDependentCareCost",
  "hasElderlyOrDisabled",
];

function mergeProfiles(extracted = {}, provided = {}) {
  const out = {};
  for (const k of PROFILE_KEYS) {
    // Provided (structured intake from the user) wins over text extraction.
    out[k] = provided[k] != null && provided[k] !== "" ? provided[k] : extracted[k];
  }
  return out;
}

function genericReflection(lang) {
  return lang === "es"
    ? "Gracias por contarme su situación. Veamos qué ayuda para comprar comida podría recibir."
    : "Thank you for telling me what's going on. Let's see what food help you might be able to get.";
}

/** Build the human-routing cards from flagged topics + the rules layer. */
function buildRouteCards(rules, flags) {
  const topics = (rules.routeToHumanTopics && rules.routeToHumanTopics.topics) || [];
  const legal = (rules.channels && rules.channels.legalHelp) || null;
  return (flags || [])
    .map((id) => topics.find((t) => t.id === id))
    .filter(Boolean)
    .map((t) => ({ topicId: t.id, label: { en: t.en, es: t.es }, legalHelp: legal }));
}

/**
 * @param {object} args { rules, text, profile, lang }
 * @returns discovery response for the API
 */
export async function runDiscovery({ rules, text, profile = {}, lang = "en" }) {
  let extracted = {};
  let reflection = genericReflection(lang);
  let language = lang;
  let sensitiveFlags = [];
  let otherNeeds = [];
  let usedModel = false;

  if (text && text.trim() && isAvailable()) {
    try {
      const r = await callJson({
        system: discoverySystem(rules),
        messages: [{ role: "user", content: text.trim().slice(0, 4000) }],
        maxTokens: 700,
      });
      usedModel = true;
      language = r.language || lang;
      if (r.reflection) reflection = String(r.reflection);
      extracted = r.profile || {};
      sensitiveFlags = Array.isArray(r.sensitiveFlags) ? r.sensitiveFlags : [];
      otherNeeds = Array.isArray(r.otherNeeds) ? r.otherNeeds : [];
    } catch (e) {
      // Model failed — fall through to the deterministic path with whatever
      // structured profile we already have. Never block the person.
      usedModel = false;
    }
  }

  const providedFlags = Array.isArray(profile.sensitiveFlags) ? profile.sensitiveFlags : [];
  const mergedProfile = mergeProfiles(extracted, profile);
  // Sensitive flags can come from the model (free text) AND from structured intake.
  mergedProfile.sensitiveFlags = [...new Set([...providedFlags, ...sensitiveFlags])];

  const estimate = screen(rules, mergedProfile);

  const allFlags = [...new Set([...(estimate.routeToHuman || []), ...mergedProfile.sensitiveFlags])];

  return {
    usedModel,
    language,
    reflection,
    profile: mergedProfile,
    estimate,
    otherNeeds,
    missing: estimate.inputsMissing && estimate.inputsMissing.length ? estimate.inputsMissing : (Array.isArray(extracted.missing) ? extracted.missing : []),
    routeToHumanCards: buildRouteCards(rules, allFlags),
  };
}
