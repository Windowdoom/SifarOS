# The Long Tomorrow: design synthesis

This document records what was taken from each of WindowDoom's earlier games and how it lands in
The Long Tomorrow. The goal: one game where you can walk a world in 3D, fly between stars, and
also govern Earth and everything beyond it, while living a whole life (and a dynasty after it).

## Sources reviewed

| Source | What it is | What we take |
|---|---|---|
| **Lyfe** (two builds, ~780 KB each) | BitLife-style life simulator: 90 data tables, 320 systems | Life chapters (Innocence → Legacy), aging, relationships, marriage and religious weddings, children, family tree, dynasty succession, careers (28 + 64 specialisations incl. Imam, Diplomat, NASA commander), companies by industry (aerospace moves: Mars colony, orbital factory, asteroid mining), real estate, faith practice, 54 political moves, 5 foreign blocs with likes/dislikes and rhetoric, macro events, the World Ledger of civilisation-scale acts (cure disease, end hunger, Dyson swarm, generation ships), alternate-reality forks |
| **Alternate Realities v8** | 540-year presidency + dynasty sim (1960 → 2500) | 13 eras, 72 policies in 9 categories (Energy, Economic, Military, Social, Trade, Immigration, Science, Space, Governance), 5 risk meters (financial, climate, unrest, AI, galactic), 11 government types computed from democracy / freedom / corporate / nationalist scores, crisis events with branching responses (Mars demands independence, AI Parliament, Homo Novus, Upload Question, Project Dyson, Galactic War), elections with demographic approval, cabinet, dynasty that can reach the top office, 19 endings |
| **Statecraft: Civilizations Beyond / Solar Fracture** (full source + offline build) | Interplanetary governance strategy | 18 nations with capacity/rights/tech/energy/food/water, 20 laws with faction vote splits, 8 charter articles, 16 national projects, 6 domestic factions, 6 advisors, operations (de-escalation, aid, mobilisation, ceasefire), delegated governors with wage mandates, AI modes (human / assist / sovereign), Institutions (Settlement Labor Congress, Assembly of Worlds, ORACLE Directorate) with legitimacy, precedents, centralisation and hearings, the Sol network (Earth, Luna, Mars, Ceres, Europa, Titan) with food/metal/fuel, blueprints (hydroponics → Helios collector, Dyson swarm, reality gate), frontier sectors (Kepler Reach, Proxima, Trappist Frontier, Andromeda Anchorage, Nacre, Mirror Sol, Janus, Afterlight), two universes (Prime and The Echo), and the 24-scene campaign **"The Long Tomorrow"** with its cast (Noor Rahman, Mara Voss, Ilyas Sen, Ada Okoro, Elena Duarte, Ren Sato) |

Content deliberately **not** carried over: Lyfe's trafficking, forced-labour and genocide actions.
Statecraft's own rule applies instead: atrocities are not playable; war and nuclear use remain
strategic abstractions with severe, lasting consequences.

## How it fits together

1. **Captain** (existing RPG). The seven-act Null Signal story, crew, ships and free exploration.
2. **Seat of power.** Reputation opens offices: Concord Council delegate → Minister → Chancellor;
   Frontier Assembly → Speaker; ORACLE Steward; Syndicate boss; or a corporate empire.
   A **new-game mode** can also start you directly as Chancellor (Statecraft) or as a young adult
   building a dynasty (Lyfe / Alternate Realities).
3. **Command** (Statecraft + Alternate Realities). Treasury and budget, laws, policies, charter,
   institutions and hearings, factions and elections, five risk meters, government type, Earth's
   nations and blocs, diplomacy, fleets and war, colonies with governors and AI modes, mega-projects
   from the World Ledger, and colonisation of worlds you have surveyed. Colonies you found appear
   as walkable 3D settlements that grow.
4. **Governance campaign.** The 24 Statecraft scenes, re-set in 2187 Sol, trigger while you hold
   office. Alternate Realities' future crises (Martian independence, the AI Parliament, the Upload
   Question, Project Dyson) arrive as eras advance.
5. **Life** (Lyfe). Age, health, relationships (crew included), marriage, children, faith practice
   (prayer and fasting in space are handled respectfully and optionally), properties, companies.
   Relativity matters: ship time ages you, Earth time ages everyone you left behind. When you die,
   play continues as your heir.
6. **The Echo** (Alternate Realities / Statecraft's second universe). Late-game gates reach Mirror
   Sol, a Sol where the story's choices went the other way.

## The Tabib (implemented)

The final, unknown threat. It is a physician of worlds. It was once a species that learned medicine before
war, and it outlived its own sun. It keeps "a house of eight rooms" in the Echo for the universes it has
saved. Seven are full. It does not hate anyone: it triages, and that is what makes it frightening.

- **Character.** It makes its rounds in the hour before dawn, so every note arrives at 04:00 ship time. It
  walks eight kilometres of ward before its first consultation. It writes in a strict clinical format:
  Presentation, Etiology, Pathophysiology, Differential, High-yield, Plan. It plans in fifty-year
  horizons and speaks in rhymed couplets. It decides in five sips, and the fifth is the verdict.
- **Trigger.** Any main-story ending, Earth year 2205, or any risk meter at 85 or more while you hold high
  office.
- **Quest.** Consultation notes arrive in the Command inbox. The Mirror Gate opens past Saturn and leads
  to Mirror Sol in the Echo. You land at the Theatre and consult.
- **Resolution.**
  - **Discharged:** show a healthy chart, meaning every risk under 40 or three World Ledger works.
  - **The Resident:** take the coat and become the next physician.
  - **Against Medical Advice:** kill it. At each phase of the boss fight it triages you, and it heals
    unless your chart is good. Governing well is how you win the fight.
- **Respect.** No faith is used to make it villainous, and it has no real-world name. Faith in the game is
  a player's optional practice, with no penalties.

## Implementation map

| Layer | Where |
|---|---|
| Content: nations, blocs, laws, policies, charter, colonies, Ledger, 24 scenes, crises, legacies, life, Tabib | `src/polity_data.js` |
| Simulation, offices, elections, campaign, colonies, Ledger, life and dynasty, Tabib, Command UI | `src/polity.js` |
| Tabib quest, dialogue and fns | `src/story.js` (`QUESTS.tabib`, `DLG.tabib`) |
| Mirror Sol, Mirror Gate, the Theatre | `src/data.js` |
| Theatre deck, boss fight, command terminals, colony growth, space elevator | `src/surface.js` |
| Helios swarm | `src/space.js` |
