# The Long Tomorrow (Godot 4 edition)

A 3D space RPG. You walk planet surfaces, fly star systems, and jump between
stars while the Earth calendar runs on. Built in Godot 4.3 with GDScript.
The story, dialogue, quests and galaxy come from the browser version in
`../long-tomorrow/`, exported to `data/game.json`.

## Play it on a Mac (Apple Silicon: M1, M2, M3)

1. Install Godot 4.3 (standard build, not .NET) from https://godotengine.org/download/archive/4.3-stable/
   (file: `Godot_v4.3-stable_macos.universal.zip`). Unzip it and drag Godot.app into Applications.
   The first time you open it, right-click the app and choose Open, because macOS asks about apps from the web.
2. Get the code. Easiest way: install GitHub Desktop, choose File > Clone Repository > `windowdoom/sifaros`,
   then switch to the branch `claude/loving-goldberg-pjqbi9`.
   (Terminal alternative: `git clone -b claude/loving-goldberg-pjqbi9 https://github.com/windowdoom/sifaros.git`.)
3. Open Godot. In the Project Manager click Import, browse to
   `sifaros/games/long-tomorrow-godot/project.godot`, then click Import & Edit.
   The first import takes a minute or two while the textures and models are processed.
4. Press F5 (or the Play button in the top right) to run the game.

On Apple Silicon, Godot's Forward+ renderer runs on Metal, which turns on real-time global
illumination (SDFGI), screen-space reflections and indirect light, and volumetric fog.
If the frame rate drops on a MacBook Air, open Project > Project Settings > Rendering and lower
the shadow size. You can also switch the renderer to "Mobile" in the top right of the editor.

### Make a double-clickable Mac app
Editor > Manage Export Templates > Download and Install. Then Project > Export > Add > macOS,
and Export Project. Because the app isn't signed, the first launch needs a right-click and then Open.

### Quick test flags
Run from a terminal to jump straight into a place:
```
/Applications/Godot.app/Contents/MacOS/Godot --path . -- --site=mars
/Applications/Godot.app/Contents/MacOS/Godot --path . -- --space=sol --near=earth
/Applications/Godot.app/Contents/MacOS/Godot --path . -- --site=earth --weather=storm
```

## Controls
On foot: WASD to move, Shift to sprint, Space to jump, mouse to aim, left click to fire, right click to aim,
R to reload, H to use a trauma kit, 1 to 6 to pick a weapon, E to use or talk, F to enter a vehicle,
B to board your ship, V to switch between first and third person.
In a vehicle: W/S for throttle, A/D to steer, Space to brake, Shift to boost, F to get out.
In space: the mouse steers, W/S for thrust, Q/E to roll, Shift to boost, C for cruise, L to land, E to dock or use a gate.
Menus: J for the journal, M for the star map, K for Command, Esc to pause (save and load).

## What's in this build
- Surfaces are built from site data: terrain with splat texturing, sky, sun and a day cycle, settlements in 18 styles,
  a street bazaar in cities and colonies, props, ores and mining, a ship on its pad, rovers (VehicleBody3D)
  and city hovercars.
- Characters are rigged and animated Mixamo bodies. The civilian body puts on an EVA suit on airless worlds.
- Combat uses the original weapon stats. Enemy AI covers sight, range, strafing, leading shots and melee.
  There's loot, a wanted level with security response, and the Tabib boss fight with its triage phases.
- Dialogue runs on the original story engine, with state-dependent lines and crew conversations.
- Weather: clear, overcast, rain, storm (lightning, with thunder delayed at 343 m/s), snow, dust, spores, ash,
  and methane rain. There's also a cloud layer.
- All sound is synthesized: effects, a rain bed, and ambience for each world.
- Space: star systems with textured planets, rings, belts, stations and gates. Flight, landing, and jumps by
  fusion torch (with real time dilation) or warp.
- Menus: title screen and character creator, save slots, journal, star map, helm, Command, shops, cutscenes and endings.

## Known gaps (honest list)
- The governance layer (`polity.gd`) is a reduced port. It covers risk meters, approval, the World Ledger,
  prognosis and the Tabib verdicts. The browser version's full laws, charter, operations and crisis simulation is not ported yet.
- There's no ship-to-ship space combat yet, and no docking interiors for stations.
- The generative radio music from the browser version is not ported.
- The high-end graphics features (SDFGI, SSR, SSIL, volumetric fog) were written for Forward+
  but could only be checked on the OpenGL fallback in the build environment. They need a look on real hardware.
