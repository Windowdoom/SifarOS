// explain.js — "I don't understand" support. Turns a confusing term into plain,
// concept-level language. Uses the model when available; otherwise falls back to
// the bilingual glossary in the rules layer; otherwise routes to the helpline.

import { callJson, isAvailable } from "../claude.js";
import { explainSystem } from "./prompts.js";

function norm(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
}

function glossaryLookup(rules, query, lang) {
  const terms = (rules.glossary && rules.glossary.terms) || [];
  const q = norm(query);
  if (!q) return null;
  const hit = terms.find((t) => {
    const id = norm(t.id);
    const en = norm(t.term && t.term.en);
    const es = norm(t.term && t.term.es);
    return id === q || en === q || es === q || (q.length > 3 && (en.includes(q) || es.includes(q) || q.includes(en)));
  });
  if (!hit) return null;
  const text = (hit.plain && (hit.plain[lang] || hit.plain.en)) || null;
  return text ? { text, source: "glossary", language: lang } : null;
}

export async function runExplain({ rules, query, lang = "en", simpler = false }) {
  if (isAvailable() && query && query.trim()) {
    try {
      const ask = simpler
        ? `Please explain this even more simply, like to someone who has never dealt with this before: "${query.trim().slice(0, 500)}"`
        : `Please explain this in plain words: "${query.trim().slice(0, 500)}"`;
      const r = await callJson({
        system: explainSystem(rules),
        messages: [{ role: "user", content: `${ask}\n\n(Answer in language code: ${lang})` }],
        maxTokens: 300,
      });
      if (r && r.text) return { text: String(r.text), source: "model", language: r.language || lang };
    } catch (e) {
      // fall through to glossary
    }
  }

  const g = glossaryLookup(rules, query, lang);
  if (g) return g;

  const helpline = rules.channels && rules.channels.statewideInfoLine;
  const phone = helpline ? helpline.phone : "211";
  return {
    text:
      lang === "es"
        ? `No tengo una explicación sencilla para eso aquí. Una persona puede ayudarle: llame al ${phone}.`
        : `I don't have a simple explanation for that here. A real person can help — call ${phone}.`,
    source: "none",
    language: lang,
  };
}
