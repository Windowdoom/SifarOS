# The Long Tomorrow

A 3D space RPG and grand-strategy game that runs in a browser. You walk real and procedural
worlds in third person, fly a Newtonian ship, fit it EVE-style, and walk an Orville-style bridge
with your crew. Skills level RuneScape-style, from 1 to 99 on the real XP curve. You can also
govern Earth, the colonies and everything beyond. The branching story is set in the Statecraft
universe: ORACLE, the Frontier League, Afterlight, Kepler Reach, the Anchorage and the Echo.

## Play

- **Published build:** open the artifact link, or serve `dist/` locally with
  `python3 -m http.server -d dist` and open http://localhost:8000. `dist/assets` links to
  the `assets/` folder.
- **One-file offline build:** run `python3 build.py --offline` to write
  `dist/the-long-tomorrow-offline.html`, about 26 MB with every model and texture embedded.
  It is not committed because of its size.

Controls are listed in-game (title screen, then Controls). The short version:

- **On foot:** WASD and mouse, E interact, F vehicles, Tab wrist computer, M star map.
- **Command:** press **K** anywhere to govern.
- **In space:** the mouse steers, W/S thrust, C cruise, L land or dock, T target, I walk the bridge.
- **Phones:** touch controls appear automatically, with a CMD button for Command.

## Start as

- **Captain:** the story. Offices open as your reputation grows.
- **Statesman:** Chancellor of the Concord from day one, with the story running around you.
- **Free play:** 300,000 credits and a warp drive, with no hand-holding.

## What is in it

### Universe
- 12 story systems, including Mirror Sol in the Echo.
- About 75 real catalogued stars, nebulae, clusters, black holes and pulsars at their measured
  galactic coordinates, plus 19 real galaxies.
- A deterministic procedural Milky Way: an exponential disk, a bulge and four logarithmic arms.
  Every 40-ly sector is seeded, so billions of systems exist and each one is the same on every
  visit. Procedural galaxies have their own seeded alien civilisations.

### Worlds
- 14 authored surface sites with real surface gravity: Ceres at 0.029 g, LHS 1140 b at 1.87 g.
- Vacuum oxygen, Europa radiation, Proxima superflares, flight with wings on Titan.
- Weather that changes over time: rain, storms with lightning (thunder is delayed by distance),
  snow, dust storms, spore and ash falls, and Titan's methane drizzle.
- Rigid-body physics (cannon-es) for barrels and crates, with blast impulses.
- NASA hardware where it belongs: Deep Space Network dishes and the Apollo LM on Luna, and
  Perseverance on Mars. The rover you drive is NASA's Space Exploration Vehicle.

### Characters
- Three rigged bodies, chosen in the creator: Operator, Civilian and Synthetic.
- Eleven animations shared across all three rigs by rest-pose retargeting, plus aiming and
  head IK.
- On airless worlds you suit up (EVA suit, helmet and headlamp).

### Story
- Seven acts, five endings and Fallout-style epilogues. Choices change faction power, crew
  loyalty, which systems each faction controls, and the Solnet news.
- Mature language, with a filter in Settings.

### Command: govern Earth and beyond
This is built from Statecraft, Alternate Realities and Lyfe.

- **Offices:**
  - Council Delegate, then Minister (six portfolios), then Chancellor of the Concord.
  - Speaker of the Frontier Assembly, ORACLE Steward, Syndicate Principal, or the Chief
    Executive of your own company.
- **A monthly simulation:**
  - The treasury.
  - 11 indicators.
  - Five risk meters: financial, climate, unrest, machine and galactic.
  - Six domestic factions.
  - The government type, computed from democracy, freedom, corporate power and nationalism.
- **Levers:**
  - 20 laws, passed on faction votes.
  - 42 policies in nine categories.
  - The eight articles of the Charter of 2104.
- **Earth in 2187:** 18 nations with fictional leaders, in five blocs, each with likes and
  dislikes. Operations run from de-escalation and aid to an abstract, costly war and ceasefire.
- **Colonies:** the Sol network plus Afterlight. You set governors, choose human or machine
  administration, set mandates and build from blueprints. You can charter new colonies on any
  world you have visited, and they grow around the landing pad.
- **The World Ledger:** 16 civilisation-scale projects. Some change what you see: the space
  elevator over Earth, and the Helios swarm around the Sun.
- **The governance campaign:** the 24 scenes of Statecraft's *The Long Tomorrow*, re-set in
  2187 with your crew as your cabinet. Alternate Realities' future crises arrive by era: Martian
  independence, the machine parliament, the singularity, Homo novus, the upload question,
  Project Dyson, the universal language and the heat death.
- **Elections and legacy:** elections by charter term, and a legacy judged by history.
- **Life:** you age by ship time while the people on Earth age by Earth time. Partnership and
  marriage (civil or religious, all respectful and optional), children, homes, a company, and
  succession to your heir. Faith practice is optional, never mandatory, and has no penalties.

### The Tabib
The physician of worlds, and the unknown threat behind everything. It makes its rounds in the
hour before dawn, writes clinical notes in couplets and plans in fifty-year horizons. It
triages civilisations. The state of the world you govern is the argument it respects. It has
three endings and a boss fight whose difficulty depends on your risk meters.

### Systems
- Weapons, Neural Targeting slow-time, vehicles, GTA-style wanted levels and radio.
- Mining, crafting, markets and procedural contracts.
- A hull hangar with power-grid and CPU fitting.
- Warp jumps with real special-relativity time costs for fusion torches.

## Build

```
npm install          # once: three r170, cannon-es, esbuild, glTF tools
python3 build.py     # dist/index.html (add --offline for the one-file build)
node tools/prepare_assets.mjs <models-dir> <textures-dir>   # only to regenerate assets/
```

Sources are in `src/` (plain JavaScript). `src/vendor.js` is bundled by esbuild into the page.
Every third-party model, texture and sky is listed with its author, licence and source in
`assets/CREDITS.json` and on the in-game Credits screen.

## Honest limits

- This is a browser game on three.js, not Unreal Engine. The realism comes from:
  - PBR materials and image-based lighting;
  - ambient occlusion, bloom and ACES tone mapping;
  - rigged Mixamo characters and scanned NASA hardware.
- There are only three body models, so crowds are varied with tint, scale and role.
- Buildings are procedural, with generated normal and roughness maps.
- There is no multiplayer server. The Captains' Registry uses the artifact's shared storage.
- Science is followed where it is known, and the codex cites sources. FTL, the Engineers,
  The Tabib and all alien life are fiction.
