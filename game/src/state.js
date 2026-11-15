// ASHLINE — the one place match state lives. Every module reads and writes this object;
// nothing keeps a private copy of score, money, timers or who is alive.

// mulberry32: a small seeded RNG. Live matches seed it from the clock; screenshot scenes
// seed it from the URL so a capture is the same render every time.
export function createRng(seed) {
  let a = seed | 0;
  return function rng() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createState(seed) {
  return {
    rng: createRng(seed),
    phase: 'menu', // menu | buy | live | over | matchover
    time: 0, // match clock, seconds of simulation
    round: 0,
    half: 1,
    scores: { jackal: 0, warden: 0 },
    playerStats: { kills: 0, deaths: 0 },
    phaseTimer: 0, // counts down the current phase (buy time, round time, end banner)
    playerTeam: 'jackal', // flips at the half
    combatants: [], // every fighter, the player included (bots.js / player.js fill this)
    player: null, // the player's combatant record
    charge: {
      state: 'carried', // carried | dropped | planting | planted | detonated | defused
      carrier: null,
      pos: { x: 0, y: 0, z: 0 },
      site: null,
      timer: 0, // detonation countdown while planted
      progress: 0, // 0..1 of the plant or defuse in progress
      actor: null, // who is planting or defusing
    },
    grenadeList: [], // live thrown grenades, simulated by weapons.js
    noises: [], // {x, z, radius, team, at} gunfire and explosions, for bot hearing
    smokes: [], // active smoke clouds {x, y, z, radius, until}
    flashes: [], // recent flash pops {x, y, z, at} — bots and the player check exposure
    killfeed: [], // {text, at} newest last, the HUD drains it
    roundLog: [], // one line per finished round, for the scoreboard
    lastRound: null, // {winner, reason} for the end banner
    winner: null, // match winner once phase is matchover
    spectate: null, // combatant the camera rides while the player is dead
    shake: 0, // camera shake energy, decays in the render loop
    hitmark: 0, // time the hitmarker was last shown (HUD reads it)
    hitmarkKill: false,
    damageFrom: null, // {x, z, at} direction of the last damage the player took
  };
}

// The two team ids, attack first in the first half.
export const TEAMS = ['jackal', 'warden'];
export function enemyOf(team) {
  return team === 'jackal' ? 'warden' : 'jackal';
}
export function aliveCount(state, team) {
  let n = 0;
  for (const c of state.combatants) if (c.team === team && c.alive) n += 1;
  return n;
}
