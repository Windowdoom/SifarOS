# Whisper — Design & Engineering Manifest

*a little town that talks*

> You are the unseen, kind-hearted spirit of a small town. You cannot act.
> You can only **whisper** — plant one thought in one ear — and then watch the
> town carry it, reshape it, and be changed by it. The wow isn't the art.
> The wow is that every twist is **traceable back to you**.

---

## 1. The pitch

A 12-person town rendered as a living social graph. Each day, people talk:
information hops **one person per day** and **mutates** as it passes through
each temperament. You get a small number of whispers, a wholesome goal, and
full omniscience. The gap between *what you said* and *what the town believes a
week later* is the entire game.

## 2. Why it's hard to replicate (the moat)

Content clones in a weekend; a believable **simulation** takes months. Whisper's
value lives entirely in one engine — belief propagation with bounded mutation —
so there's nothing to copy except the hard part.

## 3. The engine — four logically-sound subsystems

**a) A rumor is structured, not a string.** Every belief is
`{subject, topic, valence(-1..1), strength(0..1)}` over a fixed ontology
(`kindness, honesty, romance, competence`). Because it's structured, it mutates
along *specific axes* instead of turning to noise — that's what keeps it human.

**b) Beliefs ARE rumors.** There is no separate rumor object floating around.
What a person *believes* is exactly what they can *pass on*. Whispering injects a
belief; propagation regenerates rumors from beliefs each day. One source of
truth — no desync possible.

**c) People are filters, not repeaters.** Traits are pure functions on anything
passing through: `gossip` (spreads to 3, faster), `skeptic` (needs evidence,
can let a rumor die), `embellisher` (juicier — can slip the topic to an adjacent
one), `honest` (faithful, won't carry flimsy gossip), `anxious` (fears travel
further than facts), `kind` (dulls the knife on cruelty). Loyalty and jealousy
are **emergent**, not hard-coded: a person softens or darkens a rumor by how
they already feel about its subject.

**d) Belief ≠ transmission ≠ action.** A three-tier gate keeps the town from
descending into instant chaos: hearing updates a belief only via
`trust × evidence × confirmation-bias`; a skeptic can reject outright; only
beliefs that cross a strength threshold get *re-shared*; and only sustained
belief drifts **affinity**, which drifts **trust edges** — the visible world
change. The graph is alive but never explodes.

## 4. The core loop

Observe → Whisper (scarce) → *Let the day unfold* → watch it hop & twist →
react to what came back different → repeat toward a gentle goal.

## 5. Tone: wholesome by design

The *mechanics* can turn dark (an innocent truth can arrive as a lie six hops
later — that's the drama). But every **objective** is kind: clear an unjustly
accused person's name, cheer up someone lonely, let two shy hearts find a warm
word. You win by warming the town, never by wounding it — and you're forbidden
from lying to reach the honest goals.

## 6. Scope discipline

- 12 people, ~20 edges, one screen, one goal, ~10–15 min per run.
- No art budget: nodes, edges, colored pulses, and a traceable feed. The
  simulation *is* the graphics.
- Single self-contained `index.html` (no build, no network, PWA-installable).
- Seeded PRNG → runs are reproducible and every twist is auditable.

## 7. Seven-point check (run before every delivery)

1. **Loads clean** — no console errors, canvas sizes to viewport, DPR-correct.
2. **Values stay bounded** — valence ∈ [-1,1], strength/trust/evidence ∈ [0,1]
   across a full 12-day simulation (asserted in `selftest.js`).
3. **Graph stays connected & alive** — trust drifts but never leaves [0.05,0.95];
   no orphaned nodes.
4. **Three-tier gate holds** — skeptics demonstrably drop weak rumors; beliefs
   below threshold don't propagate.
5. **Goal detection works** — win fires when metric ≥ target, loss on day > max;
   neither fires early.
6. **Traceability** — every twist in the feed names who twisted it and from
   which topic; whispers are attributed to "You".
7. **Wholesome & legible** — copy stays gentle; a first-time player can read the
   graph (mood colour + trust thickness) without a tutorial.

Run: `node selftest.js` → exercises the pure engine headlessly and asserts 1–6.
