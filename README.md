[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/labibhanafi/ashline-fps/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/labibhanafi/ashline-fps/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

# ASHLINE — a three.js tactical FPS

A round-based tactical first-person shooter for make.fun's **threejs-fps-02** bounty,
in the style Counter-Strike made famous — but its own game throughout: its own map
(Kestrel Yard, a dusk freight yard), its own teams (the amber **Jackals** attack, the teal
**Wardens** defend), its own weapons, and synthesized sounds. Single-player against bot
squads, from static files, with no build step and no network request.

## The game

- **5 v 5, first to 7 rounds**, sides swap at the half. Rounds are won by elimination, by
  detonating the charge at Site A (the Crane Yard) or Site B (the Depot), by defusing it,
  or — for the defenders — by running out the clock.
- **Money between rounds**: kills pay $300, round wins up to $1,900. The buy phase sells
  four primaries (Raptor-9 SMG, Breach-12 shotgun, KR-7 Carbine, Longbow DMR), kevlar, and
  three grenades (Shard frag, Flare flash, Veil smoke). Dying costs your primary and kevlar.
- **Gunplay where accuracy counts**: head/torso/leg hit zones, spread that grows with your
  speed and sustained fire and shrinks when you crouch, recoil, damage falloff, a scope on
  the DMR. Stop, settle, burst.
- **Bots with habits**: vision cones and line-of-sight, hearing (gunfire and running feet),
  waypoint routes through the yard, site holds, rotations to the planted charge, burst
  fire, strafing, crouch-reloads, and the occasional frag thrown at a corner you were
  seen behind. Smoke blocks their sight exactly as it blocks yours.
- **HUD**: health and armour, ammunition, money, round clock and score, killfeed, a live
  minimap (teammates, sites, the charge — never the enemy), plant/defuse progress, damage
  direction, and a scoreboard with the round log.

## Play it

```sh
node serve.ts          # then open http://localhost:8080 in desktop Chrome
```

Or serve `game/` with any static file server and open `game/index.html`.

Controls: WASD move · mouse look · click fire · right-click scope (DMR) · Shift walk ·
Ctrl/C crouch · Space jump · R reload · 1/2 weapons · 4 choose grenade · G throw ·
E plant/defuse (hold) · B buy menu · Tab scoreboard.

## Layout

- `main.ts` — the entry program (Node 22, standard library only): copies `game/` and
  `screenshots/` to the output directory and writes `dossier.json` with the vendored
  make.fun library.
- `game/` — the playable game. `index.html` holds the one import map that maps `three`
  to the vendored three.js 0.187.0 under `game/vendor/three/`. Source modules, one job
  each, under `game/src/`: `config` (all tuning), `state` (the one match state),
  `mapdata` (the yard as data + the waypoint graph), `world` (meshes, procedural
  textures, light), `combat` (rays, hit zones, line of sight, damage), `player`,
  `weapons` (firing model, grenades, view models), `bots` (perception and tactics),
  `rounds` (match flow, economy, the charge), `effects` (pooled tracers/sparks/smoke),
  `audio` (synthesized WebAudio sound), `hud`, `input`, and `main` (fixed-step loop).
- `screenshots/` — four captures of the game, posed by its own `?shot=` scenes
  (see `shots.json`).
- `vendor/makefun-threejs.ts` — the kit's dossier library, unchanged.

The simulation runs at a fixed 60 Hz, apart from rendering; all state lives in one
object in `state.js`; effects are pooled and allocate nothing per frame.

## License

MIT (see `LICENSE`). three.js is vendored under its own license at
`game/vendor/three/LICENSE`.
