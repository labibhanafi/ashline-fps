// ASHLINE — boot and the one loop. A fixed 60 Hz simulation (player, bots, weapons,
// grenades, rounds) feeds a render at the display's rate; the camera, view model and HUD
// are presentation and never feed back into the simulation. Screenshot scenes arrive as
// ?shot=menu|buy|action|plant&seed=N: they pose a deterministic frame with the game's own
// systems, render it twice, set window.__shotReady and freeze.
import * as THREE from 'three';
import { PALETTE, TIMING, ECONOMY, BUY_MENU } from './config.js';
import { createState } from './state.js';
import { createWorld, createChargeMesh } from './world.js';
import { createEffects } from './effects.js';
import { createAudio } from './audio.js';
import { createInput } from './input.js';
import { createHud } from './hud.js';
import { eyeOf, stepPlayer } from './player.js';
import {
  tryFire, startReload, switchGun, throwGrenade, stepWeapons, stepGrenades, createViewModel,
} from './weapons.js';
import { giveWeapon } from './weapons.js';
import { stepBots, syncBotMesh } from './bots.js';
import {
  initRounds, createMatch, startRound, stepRounds, syncCharge, buyItem, resetMatchData,
} from './rounds.js';

const FIXED = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = shot ? (Number.parseInt(params.get('seed') ?? '1', 10) || 1) : (Date.now() % 2147483647);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 220);
camera.rotation.order = 'YXZ';
scene.add(camera);

const state = createState(seed);
const world = createWorld(scene);
const fx = createEffects(scene, camera);
const audio = createAudio();
const chargeVisual = createChargeMesh(scene);
initRounds(fx, audio, chargeVisual);
createMatch(state, scene);
const hud = createHud(state);
const input = createInput(renderer.domElement, onLockChange);

const viewModels = {};
let vmCurrent = null;
function showViewModel(defId) {
  if (vmCurrent) camera.remove(vmCurrent);
  if (!defId) {
    vmCurrent = null;
    return;
  }
  if (!viewModels[defId]) viewModels[defId] = createViewModel(defId);
  vmCurrent = viewModels[defId];
  camera.add(vmCurrent);
}

let started = false;
let buyOpen = true;
let prevPhase = state.phase;
let prevScores = { jackal: 0, warden: 0 };
let fovNow = 75;

const menuEl = document.getElementById('menu');
const pauseEl = document.getElementById('pause');
const overEl = document.getElementById('matchover');

document.getElementById('play-btn').addEventListener('click', () => {
  audio.unlock();
  menuEl.hidden = true;
  started = true;
  state.round = 0;
  startRound(state);
  buyOpen = true;
  input.requestLock();
});
document.getElementById('resume-btn').addEventListener('click', () => {
  audio.unlock();
  pauseEl.hidden = true;
  input.requestLock();
});
document.getElementById('again-btn').addEventListener('click', () => {
  overEl.hidden = true;
  resetMatchData(state);
  state.round = 0;
  startRound(state);
  buyOpen = true;
  input.requestLock();
});
hud.setBuyHandler((item) => {
  if (buyItem(state, item)) audio.buy();
  else audio.denied();
});

function onLockChange(locked) {
  if (shot) return;
  if (!locked && started && (state.phase === 'buy' || state.phase === 'live')) {
    pauseEl.hidden = false;
  } else if (locked) {
    pauseEl.hidden = true;
  }
}

// --- The fixed-step simulation. ---

function stepSim(dt) {
  state.time += dt;
  const p = state.player;
  if (state.phase === 'live') {
    if (!shot) state.playerInteracting = input.keys.has('KeyE');
    if (p.alive) stepPlayer(state, p, input, audio, dt);
    stepBots(state, fx, audio, dt);
    stepWeapons(state, dt);
    stepGrenades(state, fx, audio, dt);
    stepRounds(state, dt);
  } else if (state.phase === 'buy' || state.phase === 'over') {
    stepWeapons(state, dt);
    stepGrenades(state, fx, audio, dt);
    stepRounds(state, dt);
  }
  if (state.noises.length > 24) state.noises.splice(0, state.noises.length - 24);
  for (let i = state.noises.length - 1; i >= 0; i -= 1) {
    if (state.time - state.noises[i].at > 1.6) state.noises.splice(i, 1);
  }
}

function handleTaps() {
  const p = state.player;
  for (const code of input.takeTaps()) {
    if (code === 'KeyB' && state.phase === 'buy') {
      buyOpen = !buyOpen;
      continue;
    }
    if (state.phase === 'buy') {
      const item = BUY_MENU.find((i) => `Digit${i.key}` === code);
      if (item) {
        if (buyItem(state, item)) audio.buy();
        else audio.denied();
        hud.refreshBuyMenu();
        continue;
      }
    }
    if (!p.alive || state.phase !== 'live') continue;
    if (code === 'Digit1') switchGun(p, 'primary');
    else if (code === 'Digit2') switchGun(p, 'sidearm');
    else if (code === 'Digit4') {
      const kinds = ['frag', 'flash', 'smoke'].filter((k) => p.grenades[k] > 0);
      if (kinds.length > 0) {
        const next = kinds[(kinds.indexOf(p.grenadeSel) + 1) % kinds.length];
        p.grenadeSel = next || kinds[0];
      }
    } else if (code === 'KeyG') throwGrenade(state, p, fx, audio);
    else if (code === 'KeyR') startReload(state, p, audio);
  }
}

// --- Presentation: camera, view model, banners. ---

function syncPresentation(dt) {
  const p = state.player;
  for (const c of state.combatants) if (!c.isPlayer) syncBotMesh(c, state.time);
  syncCharge(state);
  world.update(state.time);

  let camPos = null;
  let camYaw = 0;
  let camPitch = 0;
  if (state.phase === 'menu') {
    const t = state.time * 0.05;
    camera.position.set(Math.sin(t) * 30, 13.5, Math.cos(t) * 30);
    camera.lookAt(0, 0.5, 0);
    showViewModel(null);
    return;
  }
  if (p.alive) {
    const eye = eyeOf(p);
    camPos = eye;
    camYaw = p.yaw;
    camPitch = p.pitch + p.punch;
    showViewModel(p.gun ? p.gun.id : null);
  } else if (state.spectate && state.spectate.alive) {
    const s = state.spectate;
    const eye = eyeOf(s);
    camPos = eye;
    camYaw = s.yaw;
    camPitch = s.pitch;
    showViewModel(null);
  }
  if (camPos) {
    state.shake = Math.max(0, state.shake - dt * 2.6);
    const sh = state.shake * state.shake * 0.05;
    camera.position.set(
      camPos.x + (Math.random() * 2 - 1) * sh,
      camPos.y + (Math.random() * 2 - 1) * sh,
      camPos.z + (Math.random() * 2 - 1) * sh,
    );
    camera.rotation.set(camPitch, camYaw, 0);
    audio.setListener(camPos.x, camPos.z, camYaw);
  }
  // Field of view: the Longbow's scope is a real zoom, and it punishes movement.
  const scoped = p.alive && p.gun && p.gun.def.scoped && input.aiming && state.phase === 'live';
  const targetFov = scoped ? 30 : 75;
  fovNow += (targetFov - fovNow) * Math.min(1, dt * 10);
  if (Math.abs(fovNow - camera.fov) > 0.05) {
    camera.fov = fovNow;
    camera.updateProjectionMatrix();
  }
  if (vmCurrent && p.gun) {
    const bob = Math.min(1, p.speedNow / 4) * 0.012;
    vmCurrent.position.set(
      scoped ? 0 : 0.24,
      -0.22 + Math.sin(state.time * 9) * bob - (p.gun.reloading ? 0.05 : 0),
      -0.45 + p.punch * 0.7,
    );
    vmCurrent.rotation.x = p.punch * 0.9 + (p.gun.reloading ? 0.5 : 0);
    vmCurrent.position.x = scoped ? 0 : vmCurrent.position.x;
    if (scoped) vmCurrent.position.y = -0.148; // line the scope up with the eye
  }
  // Round banners on phase changes.
  if (state.phase !== prevPhase) {
    if (state.phase === 'over' && state.lastRound) {
      const won = state.lastRound.winner === state.playerTeam;
      hud.showBanner(won ? 'ROUND WON' : 'ROUND LOST', `${state.lastRound.reason} — Jackals ${state.scores.jackal}, Wardens ${state.scores.warden}`);
    } else if (state.phase === 'live') {
      hud.hideBanner();
    } else if (state.phase === 'buy') {
      hud.hideBanner();
      buyOpen = true;
    } else if (state.phase === 'matchover') {
      hud.hideBanner();
      const won = state.winner === state.playerTeam;
      document.getElementById('final-title').textContent = state.winner === 'draw' ? 'Drawn match' : won ? 'Victory' : 'Defeat';
      document.getElementById('final-sub').textContent = `Final score — Jackals ${state.scores.jackal}, Wardens ${state.scores.warden}. You: ${state.playerStats.kills} kills, ${state.playerStats.deaths} deaths.`;
      overEl.hidden = false;
      if (document.pointerLockElement) document.exitPointerLock();
    }
    prevPhase = state.phase;
  }
  prevScores = { jackal: state.scores.jackal, warden: state.scores.warden };
}

// --- The loop. ---

let lastTime = performance.now();
let accumulator = 0;
let frozen = false;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (frozen) return;
  const paused = !shot && started && !input.locked && (state.phase === 'buy' || state.phase === 'live');
  if (!paused) {
    if (input.locked || shot) {
      const look = input.takeLook();
      const p = state.player;
      const sens = p.gun && p.gun.def.scoped && input.aiming ? 0.0011 : 0.0021;
      p.yaw -= look.x * sens;
      p.pitch = Math.max(-1.45, Math.min(1.45, p.pitch - look.y * sens));
    }
    handleTaps();
    if (!shot && input.firing && state.phase === 'live' && state.player.alive && input.locked) {
      tryFire(state, state.player, fx, audio);
    }
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED && steps < 5) {
      stepSim(FIXED);
      accumulator -= FIXED;
      steps += 1;
    }
    if (accumulator > FIXED * 5) accumulator = 0;
  }
  syncPresentation(dt);
  fx.update(dt, state.time);
  hud.update(dt, { board: input.keys.has('Tab'), buy: buyOpen });
  renderer.render(scene, camera);
}

// --- Screenshot scenes: deterministic poses built from the game's own systems. ---

function settle(steps) {
  for (let i = 0; i < steps; i += 1) stepSim(FIXED);
}

function bot(id) {
  return state.combatants.find((c) => c.id === id);
}

function place(c, x, z, yaw) {
  c.pos.set(x, 0, z);
  c.yaw = yaw;
  c.vel.set(0, 0, 0);
}

function aimAt(c, x, y, z) {
  const eye = eyeOf(c);
  const dx = x - eye.x;
  const dy = y - eye.y;
  const dz = z - eye.z;
  c.yaw = Math.atan2(-dx, -dz);
  c.pitch = Math.atan2(dy, Math.hypot(dx, dz));
}

function runShot(name) {
  menuEl.hidden = true;
  state.round = 0;
  startRound(state);
  const p = state.player;
  if (name === 'menu') {
    state.phase = 'menu';
    menuEl.hidden = false;
    place(bot(1), -9, 11, -2.2);
    place(bot(2), -3.5, 13.5, -2.6);
    place(bot(6), 3, -3, 2.4);
    place(bot(7), 7.5, 5, 2.9);
    camera.position.set(-7.5, 4.6, 19);
    camera.lookAt(2, 1, -6);
    for (const c of state.combatants) if (!c.isPlayer) syncBotMesh(c, 0);
    syncCharge(state);
  } else if (name === 'buy') {
    state.phase = 'buy';
    state.phaseTimer = 8;
    place(p, -30, 21.5, Math.atan2(-(0 - -30), -(0 - 21.5)) + 0.35);
    place(bot(1), -26.5, 18.5, 2.6);
    place(bot(2), -24.5, 22.5, 2.2);
    place(bot(3), -28, 16.5, -0.6);
    giveWeapon(p, 'rifle');
    p.money = 2450;
    settle(2);
  } else if (name === 'action') {
    state.phase = 'live';
    state.phaseTimer = 63;
    giveWeapon(p, 'rifle');
    p.armor = true;
    p.hp = 78;
    place(p, -13.5, 3.5, 0);
    const foe = bot(6);
    giveWeapon(foe, 'smg');
    place(foe, -5.6, 0.6, 0);
    aimAt(foe, p.pos.x, 1.3, p.pos.z);
    foe.brain.target = p;
    foe.brain.lastSeenAt = 0;
    foe.brain.reactionAt = -1;
    foe.brain.burstLeft = 4;
    place(bot(7), 8.5, 8.5, 2.2);
    place(bot(1), -16.5, 7, -1.4);
    aimAt(p, foe.pos.x, 1.25, foe.pos.z);
    settle(16);
    aimAt(p, foe.pos.x, 1.25, foe.pos.z);
    tryFire(state, p, fx, audio);
    tryFire(state, p, fx, audio);
  } else if (name === 'plant') {
    state.phase = 'live';
    state.phaseTimer = 48;
    giveWeapon(p, 'rifle');
    place(p, 22.3, 11.8, 0);
    aimAt(p, 19.5, 1.2, 16.8); // toward the covering teammate, the site ring in frame
    state.charge.state = 'carried';
    state.charge.carrier = p;
    state.playerInteracting = true;
    const mate = bot(1);
    place(mate, 18.8, 17.5, -0.7);
    mate.crouch = true;
    const dead = bot(8);
    place(dead, 27.5, 8.6, 1.2);
    dead.alive = false;
    dead.diedAt = state.time - 1.5;
    settle(38);
    state.charge.progress = 0.62; // mid-plant, frozen for the capture
    state.charge.actor = p; // the progress bar reads the actor
    state.playerInteracting = false;
  }
  syncPresentation(0.016);
  if (name === 'menu') {
    camera.position.set(-7.5, 4.6, 19); // re-pose: syncPresentation's menu orbit moved it
    camera.lookAt(2, 1, -6);
  }
  hud.update(0.016, { board: name === 'plant' ? false : false, buy: true });
  let painted = 0;
  function paint() {
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
      return;
    }
    requestAnimationFrame(paint);
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.__ashline = { state };
if (shot) runShot(shot);
else {
  // Pose the menu backdrop: a posed round behind the title panel.
  state.round = 0;
  startRound(state);
  state.phase = 'menu';
  requestAnimationFrame(frame);
}
