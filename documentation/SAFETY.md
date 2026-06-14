# Safety model

This system can harm people if it is careless: telling someone they qualify when
they don't wastes a day they couldn't spare; telling someone they don't when they do
costs them food they were owed. Every hard rule from the build spec is mapped here to
the place in the code that enforces it.

| Hard rule | How it is enforced |
|---|---|
| **Never invent a program, rule, dollar amount, deadline, or document requirement.** | All concrete values live in `/rules/*.json`. No eligibility numbers exist in any `.js` file. `screener.js` reads thresholds/allotments/deductions from the rules object it is handed. `scripts/validate-rules.mjs` fails CI if any value lacks a `source`. |
| **The model must not fabricate.** | `server/reasoning/prompts.js` restricts the model to *understanding* the person (extract profile, detect language, flag sensitive topics) and forbids stating amounts/limits/deadlines. The deterministic screener — not the model — produces every number. The model literally has no number to repeat. |
| **Separate the reasoning layer from the rules layer.** | Two folders: `/rules` (data) and `/server/reasoning` + `/public/js/screener.js` (logic). `rules-loader.js` is the only bridge. Documented in `ARCHITECTURE.md`. |
| **When unsure, say so and route to a human.** | `screener.js` returns `unknown` when inputs are missing, biases to `maybe` near thresholds, and lowers `confidence` when expense inputs are absent. Every result carries an "this is an estimate, only the state can decide" disclaimer. |
| **Eligibility rules change; don't ship stale rules as truth.** | Every value has `effectiveDate`/`expiresDate` and a `verified` flag. While any value is `verified: false`, the app shows the unofficial-estimate banner (`verify.banner`) on every screen with numbers. Updating a rule is a JSON edit, never a code change. |
| **Always show the official channel and a human number.** | The footer **help strip** (`renderHelpStrip`) shows the official portal + helpline on *every* screen, and every view also renders a fuller `helpCard` (official site, call, 211, free legal help). Sourced from each state's `channels`. |
| **Know the edges; route to humans.** | `routeToHumanTopics` in the federal rules lists immigration status, disability determination, appeals, overpayment/fraud, and custody. The citizenship application step carries `routeToHuman`. Discovery surfaces a red "this needs a real person" card with the free legal-aid link. The model is instructed to flag these and not resolve them. |
| **Detect confusion and simplify.** | An "I don't understand" button sits on each application question and opens a plain-language explanation, with an "even simpler" option. Offline/no-key, it falls back to the bilingual glossary in the rules. Reading level targets ~6th grade throughout. |
| **Works in the person's language.** | UI in `i18n/en.json` + `i18n/es.json`; all user-facing rules content is bilingual `{en, es}`; the model responds in the language the person used and explains concepts, not literal word swaps. |
| **Ask for the minimum; keep the person in control.** | Discovery questions are all skippable. Free text is sent only to produce a result and **never stored** (the server is stateless and logs no bodies). All saved data is `localStorage` on the device, listed on the Privacy screen, and erasable in one tap (`deleteAllData` clears storage + caches). |
| **Assume an old phone, little data, possible crisis.** | Zero-dependency PWA, service-worker cached, offline-capable, large tap targets, high contrast, autosaved progress, and a one-line "find food today — 211" path for emergencies. |

## What the system explicitly does NOT do

- It does not submit anyone's application — it prepares the person and hands off to
  the official portal (always linked).
- It does not give legal advice or make immigration/disability/appeal
  determinations.
- It does not promise background push notifications it can't deliver on an offline
  PWA; it offers real calendar (`.ics`) reminders and prominent on-screen dates
  instead.
- It does not store personal information on a server. There is no server-side
  database, by design.

## Operator responsibilities before production

1. Verify every `verified: false` value against its cited `source`; set
   `verified: true`. Run `npm run validate`.
2. Confirm the helpline numbers and portal URLs are current and answer in the listed
   languages.
3. Re-check rules at least annually (the federal COLA changes every October 1) and
   whenever law changes (e.g. the 2025 reconciliation law phases in SNAP changes
   through 2028).
