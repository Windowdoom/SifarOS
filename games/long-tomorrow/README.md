# The Long Tomorrow

A 3D space RPG that runs in a browser: third-person exploration on real and procedural worlds,
Newtonian ship flight, EVE-style ship fitting, a walkable Orville-style bridge with a crew,
RuneScape-style skills (1–99 on the real XP curve), and a branching story set in the
Statecraft universe (ORACLE, the Frontier League, Afterlight, Kepler Reach, the Anchorage).

## Play

- `dist/the-long-tomorrow-offline.html`: one self-contained file. Open it in Chrome, Edge,
  Firefox or Safari. No server, no install, no internet needed (fonts fall back if offline).
- `dist/index.html`: the same game loading three.js r128 from cdnjs.

Controls are listed in-game (title screen → Controls). Short version: WASD + mouse on foot,
E interact, F vehicles, Tab wrist computer, M star map; in space, mouse steers, W/S thrust,
C cruise, L land/dock, T target, I walk the bridge. Touch controls appear automatically on phones.

## What is in it

- **Universe.** 11 story systems, ~75 real catalogued stars, nebulae, clusters, black holes and
  pulsars at their measured galactic coordinates, 19 real galaxies, and a deterministic
  procedural Milky Way (exponential disk, bulge, four logarithmic arms): every 40-ly sector is
  seeded, so billions of systems exist and each is identical on every visit. Procedural
  galaxies carry their own seeded alien civilizations (ethos, body plan, tech tier, attitude).
- **Worlds.** 13 authored surface sites with real surface gravity (Ceres 0.029 g → 34 m jumps;
  LHS 1140 b 1.87 g), vacuum oxygen, Europa radiation, Proxima superflares, Titan wing flight,
  methane seas, Sgr A*'s accretion disk in the sky. Procedural sites in 12 biomes with outposts,
  raider camps, ruins, derelicts, Engineer vaults and alien towns.
- **Story.** Seven acts, five endings, Fallout-style epilogues. Choices change faction power,
  crew loyalty, which systems each faction controls, and the Solnet news. Mature language
  (filter in Settings).
- **Systems.** Skills, attributes, origins; weapons, Neural Targeting slow-time, vehicles with
  suspension, GTA-style wanted levels and radio; mining (surface veins, asteroid belts,
  gas-giant helium-3 scooping); crafting; markets; procedural contracts; hull hangar and
  power-grid/CPU fitting; warp jumps with real special-relativity time costs for fusion torches.

## Build

```
python3 build.py path/to/three.min.js   # three.js r128 build
```

Sources are in `src/` (plain JavaScript, no bundler). `build.py` concatenates them into the two
HTML builds. three.js is MIT-licensed (threejs.org/license).

## Honest limits

Everything is procedural: characters and buildings are built from primitives and shaders, not
artist-made models. There is no multiplayer server. Science is followed where it is known (the
codex cites sources); FTL, the Engineers and all alien life are fiction, and the codex says so.
