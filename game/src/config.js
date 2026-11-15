// ASHLINE — every tunable number in one place: palette, weapons, grenades, economy, timings.
// Nothing in this file touches the DOM or three.js; the other modules read it, never mutate it.

// Dusk over a freight yard: deep blue-grey sky, warm sodium light, teal and amber teams.
export const PALETTE = {
  sky: 0x1c2836,
  fog: 0x232f3d,
  ground: 0x3b4046,
  groundLine: 0x2e3338,
  concrete: 0x8b8f8c,
  wallDark: 0x4a4f57,
  crate: 0x9a7b4f,
  accent: 0xf2a33c,
  jackal: 0xf2a33c, // attackers: amber
  warden: 0x35c4b5, // defenders: teal
  containers: [0xa34d3a, 0x3a6ea5, 0x4d7c59, 0xb07f2e, 0x5d6d7e, 0x7a4a63],
  ink: '#ece7db',
  muted: '#9aa3ab',
};

export const TIMING = {
  buySeconds: 12,
  roundSeconds: 105,
  plantSeconds: 3.5,
  defuseSeconds: 5,
  detonateSeconds: 40,
  endSeconds: 5.5, // round-end banner before the next buy phase
  roundsToWin: 7,
  maxRounds: 12,
  halfRound: 6, // sides swap after this many rounds
};

export const ECONOMY = {
  startMoney: 800,
  maxMoney: 9000,
  killReward: 300,
  winElimination: 1400,
  winObjective: 1900, // detonation for attackers, defuse for defenders
  winTimeout: 1400, // defenders win on time
  lossBonus: 1400,
  plantTeamBonus: 800,
  plantPersonalBonus: 300,
  armorPrice: 650,
};

// Damage is per pellet/bullet at the chest. Head multiplies, legs divide, armour absorbs.
// spreadBase is the resting cone in radians; spreadMove is added at full run speed; bloom is
// added per shot and decays. The lesson the numbers teach: stop, crouch, then fire.
export const WEAPONS = {
  sidearm: {
    name: 'P9 Sidearm', slot: 'sidearm', price: 0, damage: 26, headMult: 3.4, legMult: 0.75,
    rpm: 340, mag: 12, reserve: 48, reloadSeconds: 1.5, auto: false,
    spreadBase: 0.011, spreadMove: 0.045, spreadCrouch: 0.6, bloom: 0.006, bloomMax: 0.05,
    recoil: 0.011, range: 60, falloffFrom: 18, falloffTo: 0.55, pellets: 1, tracer: 0xffd9a0,
    kick: 0.35, soundPitch: 1.25,
  },
  smg: {
    name: 'Raptor-9 SMG', slot: 'primary', price: 1250, damage: 21, headMult: 3.2, legMult: 0.75,
    rpm: 800, mag: 32, reserve: 96, reloadSeconds: 2.1, auto: true,
    spreadBase: 0.017, spreadMove: 0.05, spreadCrouch: 0.65, bloom: 0.005, bloomMax: 0.06,
    recoil: 0.008, range: 55, falloffFrom: 12, falloffTo: 0.45, pellets: 1, tracer: 0xffd9a0,
    kick: 0.22, soundPitch: 1.5,
  },
  shotgun: {
    name: 'Breach-12', slot: 'primary', price: 1100, damage: 10, headMult: 2.6, legMult: 0.8,
    rpm: 68, mag: 6, reserve: 24, reloadSeconds: 2.9, auto: false,
    spreadBase: 0.055, spreadMove: 0.03, spreadCrouch: 0.85, bloom: 0.01, bloomMax: 0.03,
    recoil: 0.05, range: 26, falloffFrom: 6, falloffTo: 0.3, pellets: 8, tracer: 0xffc98a,
    kick: 1.0, soundPitch: 0.7,
  },
  rifle: {
    name: 'KR-7 Carbine', slot: 'primary', price: 2700, damage: 33, headMult: 3.6, legMult: 0.75,
    rpm: 600, mag: 30, reserve: 90, reloadSeconds: 2.4, auto: true,
    spreadBase: 0.008, spreadMove: 0.055, spreadCrouch: 0.55, bloom: 0.007, bloomMax: 0.055,
    recoil: 0.014, range: 90, falloffFrom: 30, falloffTo: 0.7, pellets: 1, tracer: 0xffe2b0,
    kick: 0.5, soundPitch: 1.0,
  },
  dmr: {
    name: 'Longbow DMR', slot: 'primary', price: 3200, damage: 88, headMult: 3.2, legMult: 0.7,
    rpm: 105, mag: 5, reserve: 25, reloadSeconds: 2.8, auto: false,
    spreadBase: 0.0015, spreadMove: 0.09, spreadCrouch: 0.5, bloom: 0.02, bloomMax: 0.04,
    recoil: 0.045, range: 140, falloffFrom: 60, falloffTo: 0.85, pellets: 1, tracer: 0xfff3cf,
    kick: 1.4, soundPitch: 0.55, scoped: true,
  },
};

export const GRENADES = {
  frag: { name: 'Shard Grenade', price: 300, radius: 6.5, damage: 96, fuse: 1.6 },
  flash: { name: 'Flare Grenade', price: 200, radius: 16, blindSeconds: 2.6, fuse: 1.3 },
  smoke: { name: 'Veil Grenade', price: 300, radius: 3.4, cloudSeconds: 13, fuse: 1.1 },
};

export const BUY_MENU = [
  { key: '1', id: 'smg', label: WEAPONS.smg.name, price: WEAPONS.smg.price, kind: 'weapon' },
  { key: '2', id: 'shotgun', label: WEAPONS.shotgun.name, price: WEAPONS.shotgun.price, kind: 'weapon' },
  { key: '3', id: 'rifle', label: WEAPONS.rifle.name, price: WEAPONS.rifle.price, kind: 'weapon' },
  { key: '4', id: 'dmr', label: WEAPONS.dmr.name, price: WEAPONS.dmr.price, kind: 'weapon' },
  { key: '5', id: 'armor', label: 'Kevlar Vest + Helm', price: ECONOMY.armorPrice, kind: 'armor' },
  { key: '6', id: 'frag', label: GRENADES.frag.name, price: GRENADES.frag.price, kind: 'grenade' },
  { key: '7', id: 'flash', label: GRENADES.flash.name, price: GRENADES.flash.price, kind: 'grenade' },
  { key: '8', id: 'smoke', label: GRENADES.smoke.name, price: GRENADES.smoke.price, kind: 'grenade' },
];

export const BOT = {
  count: 5, // per team, including the player's slot on the player's team
  speed: 4.55,
  reactionSeconds: 0.42,
  burstMin: 3,
  burstMax: 6,
  burstPause: 0.34,
  visionRange: 46,
  visionCos: Math.cos((104 * Math.PI) / 360), // half of a 104-degree cone
  hearingRange: 30,
  aimErrorBase: 0.016, // radians of aim wander, grows with range and target speed
};

export const PLAYER = {
  speed: 4.9,
  walkSpeed: 2.6, // shift: quiet and accurate
  crouchSpeed: 2.2,
  accel: 42,
  airAccel: 6,
  jumpSpeed: 4.6,
  gravity: 13.5,
  eyeStand: 1.62,
  eyeCrouch: 1.12,
  radius: 0.42,
  heightStand: 1.78,
  heightCrouch: 1.28,
};
