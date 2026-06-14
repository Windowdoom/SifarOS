# Architecture

The Navigator is deliberately small and boring where it can be, so the part that
must be trustworthy — the separation between *what the system knows* and *how it
reasons* — is impossible to miss.

## The two layers

```
        ┌─────────────────────────────────────────────────────────┐
        │  RULES LAYER  (/rules/*.json)  — pure data, fully sourced │
        │  income limits · allotments · deductions · documents ·    │
        │  application steps · channels · interview · renewals      │
        │  every value: { source, effectiveDate, verified }         │
        └───────────────▲─────────────────────────────────────────┘
                        │  rules-loader.js (compose + deep-merge + cache)
                        │  THE ONLY BRIDGE
        ┌───────────────┴─────────────────────────────────────────┐
        │  REASONING LAYER — contains NO eligibility numbers        │
        │                                                           │
        │  screener.js     deterministic estimate from rules        │
        │  discovery.js    understand → screen → ground             │
        │  explain.js      plain-language, glossary fallback        │
        │  claude.js       optional model: understands, never decides│
        └───────────────────────────────────────────────────────────┘
```

If a number is wrong, you fix it in one JSON file and re-run the validator. No logic
changes. This is the "separate the reasoning layer from the rules layer so rules can
be refreshed without rebuilding the system" requirement, made literal.

## Composition

`rules/_index.json` lists each jurisdiction and the files that compose it:

```
us-tx → [ snap-federal-fy2026.json, snap-common-content-en-es.json, snap-tx-fy2026.json ]
```

`rules-loader.js` deep-merges them in order (federal base → shared content → state
overlay; later wins) into one effective ruleset, cached in memory. State overlays
add channels, the income model (BBCE gross-income basis, asset test), and renewal
specifics; they can override any shared field.

## Data flow per mode

- **Discovery (free text, model on):** browser `POST /api/discovery {text}` →
  `discovery.js` asks the model to extract a structured profile + language +
  sensitive flags (no numbers) → `screener.js` computes the decision and every
  dollar figure from the rules → server returns a grounded result. The raw text is
  never stored.
- **Discovery (questions / offline):** the browser runs the **same `screener.js`**
  on-device against the cached rules. No server needed.
- **Application / Preparation / Retention:** fully data-driven from the merged rules
  (steps, documents, interview info, certification periods). Progress and dates live
  in `localStorage`. Renewal/report/interview dates produce downloadable `.ics`
  calendar reminders — a mechanism that actually works offline on old phones, rather
  than a background-push promise the app can't keep.

## Why this stack

- **Zero runtime dependencies.** The server is `node:http` + global `fetch`; the
  client is vanilla ES modules. Nothing to install, a tiny attack surface, and it
  runs anywhere Node 18+ runs.
- **PWA + service worker.** App shell, screener, i18n, and the rules response are
  cached, so the lifecycle works on a slow or absent connection and re-loads cost
  almost no data.
- **One screener, two runtimes.** `screener.js` has no DOM/Node coupling, so the
  browser (offline) and the server (to ground the model) run identical math.

## Privacy posture

The server is **stateless**: it stores nothing and logs only `method path status`
— never request bodies, query values, or any PII. All user data is on the device
and is erasable in one tap (clears `localStorage` and the caches).

## Extending

- **Add a state:** add a verified overlay file + an `_index.json` entry. See
  [`../rules/README.md`](../rules/README.md).
- **Add a language:** add `public/i18n/<code>.json`, add it to the service-worker
  shell list, and provide that language in the rules content blocks. The model path
  already responds in the person's language.
- **Add a program (Phase 3):** the same two-layer pattern — a new rules namespace +
  reasoning that reads it. Discovery can then reason across programs.
