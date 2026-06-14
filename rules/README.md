# The rules layer

This folder is the **rules layer**. It is **pure data**. It contains every concrete
fact the Navigator is allowed to tell a person: income limits, benefit amounts,
deductions, document requirements, application channels, phone numbers, and
renewal timing.

**There is no logic in this folder, and there are no eligibility numbers anywhere
else in the codebase.** The reasoning layer (`/server/reasoning`) and the screener
(`/public/js/screener.js`) read these files and never hardcode a rule. This is the
"separate the reasoning layer from the rules layer" requirement from the build
prompt: rules can be refreshed from authoritative sources without touching any
logic.

## The provenance contract (non-negotiable)

Every concrete value MUST carry, on its own object or its parent table:

- `source` — a URL to the authoritative source it came from
- `effectiveDate` (and `expiresDate` where the value expires, e.g. a fiscal year)
- `verified` — `true` only after a human operator has confirmed the value against
  the cited source. **Seed data ships as `verified: false`.**

`scripts/validate-rules.mjs` enforces this. It fails the build if a concrete value
is missing provenance.

### What `verified: false` means in the running app

The Navigator **never presents an unverified number to a person as fact**. While a
jurisdiction still contains `verified: false` values, the app:

- labels every eligibility result as an *unofficial estimate*,
- shows the official application channel and a human helpline on every screen, and
- pushes the person toward confirming with the county/state and a real person.

This is why the seed data is safe to ship: its honesty does not depend on the
numbers being perfect. It depends on provenance, the verification workflow, and
routing to humans.

## File layout

| File | What it holds |
|---|---|
| `_index.json` | The registry: which jurisdictions exist and which files compose each. Data only. |
| `snap-federal-fy2026.json` | Federal SNAP financial standards (income limits, allotments, deductions, statutory formula constants) + federal concepts + the topics that must route to a human. |
| `snap-common-content-en-es.json` | Shared bilingual content: application steps, document catalog, interview basics, plain-language glossary. |
| `snap-ca-fy2026.json` | California (CalFresh) overlay: channels, income model, interview/renewal specifics. |
| `snap-la-fy2026.json` | Louisiana overlay. |
| `snap-tx-fy2026.json` | Texas overlay. |

The server composes a jurisdiction by deep-merging its `compose` list in order
(`federal -> common -> state`); later files win. The screener and reasoning layer
consume the merged result.

## How to update a value

1. Open the authoritative source (USDA FNS for federal; the state agency for state
   overlays — see each file's `primarySources`).
2. Update the value in the JSON.
3. Set `verified: true` and update `effectiveDate` once you have confirmed it.
4. Run `node scripts/validate-rules.mjs`.

## How to add a Gulf South (or any) state

1. Copy `snap-tx-fy2026.json` (asset-test example) or `snap-la-fy2026.json` (no
   asset test) as a template.
2. Fill in the state's `jurisdiction`, `eligibilityModel` (gross income basis %,
   asset test), `channels`, `interview`, and `retention` from the **state agency's
   own pages**. Keep everything `verified: false` until confirmed.
3. Register the state in `_index.json` with `compose: ["snap-federal-fy2026.json",
   "snap-common-content-en-es.json", "<your-file>.json"]`.
4. Run the validator. **Never register a state without a real overlay file** — the
   build prompt forbids claiming coverage that has not been verified.

## Verification status (Phase 1)

All three current overlays (CA, LA, TX) ship as **seed data, `verified: false`**.
Federal FY2026 figures were assembled from USDA FNS COLA publications; state
channels and rules from each state agency and legal-aid guides. **An operator must
verify each value against the cited source before this is used with real people.**
