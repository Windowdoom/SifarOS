# The Navigator

**A plain-language companion that helps people get the food assistance (SNAP) they
qualify for — and keep it.**

Most people who miss out on benefits they qualify for don't miss out because they're
ineligible. They miss out because of friction: forms written above their reading
level, in a language they don't speak; a missed interview; a renewal letter that
arrived and wasn't understood. The Navigator does, for an ordinary person, what a
dedicated caseworker does for the few who can get one — across the whole lifecycle:

1. **Discovery** — describe your situation in your own words (typed or spoken, in
   English or Spanish); get an honest, grounded estimate of whether you likely
   qualify, and roughly how much.
2. **Application** — a step-by-step walkthrough in plain language: each official
   question explained, the documents you'll need, and the mistakes that cause
   denials, flagged before they happen.
3. **Preparation** — what the eligibility interview will ask, when and how it
   happens, and exactly what to have ready.
4. **Retention** — your renewal and report dates tracked, with calendar reminders,
   so you never lose benefits to a missed deadline.

> **Phase 1 scope:** SNAP for **California (CalFresh), Louisiana, and Texas** — the
> Gulf South plus California — in **English and Spanish**. The architecture is
> built so new states and languages are added as *data*, one verified jurisdiction
> at a time.

This is a low-bandwidth, installable Progressive Web App with **zero runtime
dependencies**. It runs on an old Android phone and **works offline** after first
load.

---

## What makes it trustworthy (the whole point)

A tool like this fails catastrophically if it gives confident wrong answers. The
honesty is built into the architecture, not bolted on:

- **The reasoning layer and the rules layer are strictly separated.** Every concrete
  fact — income limit, benefit amount, document requirement, phone number, renewal
  interval — lives in [`/rules/*.json`](rules/README.md) as data. **There are no
  eligibility numbers anywhere in the code.** Rules can be refreshed from
  authoritative sources without touching any logic.
- **Nothing is fabricated.** Every value carries a `source`, an `effectiveDate`, and
  a `verified` flag. A validator (`npm run validate`) fails the build if any value
  lacks provenance. Seed data ships as `verified: false`, and while a state still
  has unverified values the app **labels every estimate as unofficial** and pushes
  the person to confirm with the official channel and a human.
- **The model never invents rules.** When the Claude reasoning model is enabled, its
  job is to *understand* the person (extract their situation, detect their language,
  flag sensitive topics) — the deterministic screener produces every number from the
  rules layer. So the model *cannot* state a rule that isn't in the data.
- **The official channel and a human helpline are on every screen.** The person is
  never trapped in the tool.
- **It knows its edges.** Immigration status, disability determinations, appeals,
  overpayments — these route to a human and a free legal-aid resource. The Navigator
  never pretends to be a lawyer or a caseworker.
- **Minimal data, on the device.** All answers stay in `localStorage` on the
  person's own phone. Free-text descriptions are sent only to produce a result and
  are never stored server-side. One tap deletes everything.

See [`docs/SAFETY.md`](docs/SAFETY.md) for how each hard rule maps to code.

---

## Quickstart

Requires **Node 18+** (uses the built-in `fetch` and HTTP server — no `npm install`).

```bash
# from the repo root
npm start            # serves the app + API on http://localhost:3000
```

Open <http://localhost:3000>. Pick a state, and go.

### Run the checks

```bash
npm run validate     # provenance contract on every rules value
npm run smoke        # end-to-end reasoning checks for every state
npm test             # both
```

### Turn on the Claude reasoning model (optional)

The app is fully functional **without** a key (it uses the on-device screener and
guided questions). With a key, Discovery accepts free-text/voice in the person's own
words and the "I don't understand" button gives live plain-language explanations.

```bash
export ANTHROPIC_API_KEY=sk-ant-...      # enables the reasoning layer
export CLAUDE_MODEL=claude-sonnet-4-6    # optional; this is the default
npm start
```

The model is called only for two things: understanding a free-text description
(Discovery) and explaining a confusing term on request. It is given the person's
words and asked to extract structure and flag sensitive topics — it is **not** asked
to decide eligibility or quote numbers.

---

## How it's organized

```
rules/                      THE RULES LAYER — pure data, fully sourced
  _index.json               registry of states + which files compose each
  snap-federal-fy2026.json  federal SNAP standards + statutory formula + human-routing topics
  snap-common-content-en-es.json   shared bilingual steps, documents, interview, glossary
  snap-ca-fy2026.json       California (CalFresh) overlay
  snap-la-fy2026.json       Louisiana overlay
  snap-tx-fy2026.json       Texas overlay
  README.md                 the provenance contract + how to update / add a state

server/                     THE REASONING LAYER (server side) — no eligibility numbers
  index.js                  zero-dependency HTTP server (static + API); stateless; logs no PII
  rules-loader.js           composes + deep-merges + caches a jurisdiction's rules
  claude.js                 thin Claude API client (optional; graceful when absent)
  reasoning/
    prompts.js              system prompts that encode the hard rules
    discovery.js            Job 1: understand -> screen -> grounded result
    explain.js              plain-language explanation (model, then glossary fallback)

public/                     THE PWA — vanilla, low-bandwidth, offline-capable
  index.html  styles.css  manifest.webmanifest  sw.js  icons/
  js/app.js                 router, the four modes, on-device persistence, reminders
  js/screener.js            the deterministic estimator (shared by browser AND server)
  i18n/en.json  i18n/es.json   UI strings

scripts/
  validate-rules.mjs        enforces the provenance contract
  smoke.mjs                 end-to-end reasoning assertions
docs/
  ARCHITECTURE.md  SAFETY.md
```

The screener (`public/js/screener.js`) is deliberately a plain ES module with no
DOM or Node dependencies, so **the exact same eligibility math runs in the browser
(offline) and on the server (to ground the model).**

---

## ⚠️ Verification status

**All three states currently ship as seed data (`verified: false`).** The federal
FY2026 figures were assembled from USDA FNS COLA publications; the state channels,
income models, and renewal rules from each state agency and legal-aid guides, with
sources recorded on every value. **They must be confirmed by an operator against the
cited sources before the Navigator is used with real people.** This is the explicit
contract in the build spec: the Navigator consumes verified rules as data; it never
hardcodes them and never presents an unverified number as fact.

To verify and flip a value to `verified: true`, see
[`rules/README.md`](rules/README.md).

---

## The honest roadmap

The discipline *is* the product. Built depth-first, not breadth-first:

- **Phase 1 (this build):** the full SNAP lifecycle — discovery, application,
  interview prep, renewal tracking — for CA / LA / TX, in EN/ES, with every rule
  sourced.
- **Phase 2 (this build):** the lifecycle depth where people fall out — an
  interview **readiness checklist** and **practice questions** with answer hints,
  **missed-interview recovery** (state-specific), and a full guided **renewal
  walkthrough** with between-renewal change-reporting and the common reasons
  renewals fail. (Operator rule-verification is still pending — see above.)
- **Phase 3:** adjacent programs in the same places (Medicaid, utility assistance,
  WIC) — the cross-program reasoning is the differentiator.
- **Phase 4:** more languages actually spoken in these places (e.g. Vietnamese and
  Haitian Creole in the Gulf South).
- **Phase 5:** more states, one verified jurisdiction at a time.

A tool that is genuinely correct for SNAP in three states is worth more than one
that is plausibly wrong about forty programs nationwide.

---

*The Navigator is not the government and not a lawyer. It helps people use the real
system, and always points them to the official channel and a human. Released under
CC0.*
