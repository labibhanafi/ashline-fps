// ASHLINE — weapons: the gun runtime every fighter carries, the firing model, and grenades.
// The firing model is the game's lesson: spread grows with your speed and with sustained
// fire (bloom), shrinks when you crouch, and the view kicks with every shot — so the
// accurate way to shoot is to stop, settle, and fire in short bursts. Bots obey the same
// numbers; their skill lives in bots.js aim error, not in better guns.
import * as THREE from 'three';
import { WEAPONS, GRENADES, PLAYER } from './config.js';
import { raycast, applyDamage, explosionDamage, lineOfSight } from './combat.js';
import { eyeOf, speedRatio } from './player.js';

export function makeGun(defId) {
  const def = WEAPONS[defId];
  return { id: defId, def, mag: def.mag, reserve: def.reserve, cooldown: 0, reloading: false, reloadEnd: 0, bloom: 0 };
}

export function giveWeapon(c, defId) {
  const gun = makeGun(defId);
  c.guns[gun.def.slot] = gun;
  if (gun.def.slot === 'primary' || !c.gun) c.gun = gun;
  return gun;
}

export function switchGun(c, slot) {
  if (c.guns[slot] && c.gun !== c.guns[slot]) {
    c.gun.reloading = false;
    c.gun = c.guns[slot];
    return true;
  }
  return false;
}

export function spreadFor(c, def) {
  const move = (c.isPlayer ? speedRatio(c) : Math.min(1, (c.speedNow || 0) / 4.55));
  let s = def.spreadBase + def.spreadMove * move + (c.gun ? c.gun.bloom : 0);
  if (c.crouch) s = def.spreadBase * def.spreadCrouch + def.spreadMove * move * 0.5 + (c.gun ? c.gun.bloom : 0);
  if (c.grounded === false) s += 0.03;
  return s;
}

export function startReload(state, c, audio) {
  const gun = c.gun;
  if (!gun || gun.reloading || gun.mag >= gun.def.mag || gun.reserve <= 0) return;
  gun.reloading = true;
  gun.reloadEnd = state.time + gun.def.reloadSeconds;
  if (c.isPlayer && audio) audio.reload();
}

function dirFrom(yaw, pitch, out) {
  const cp = Math.cos(pitch);
  out.set(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
  return out;
}

const tmpDir = new THREE.Vector3();
const tmpDir2 = new THREE.Vector3();

// One trigger pull. Returns true when a round actually left the barrel.
export function tryFire(state, c, fx, audio) {
  const gun = c.gun;
  if (!gun || gun.reloading || gun.cooldown > 0 || !c.alive) return false;
  const def = gun.def;
  if (gun.mag <= 0) {
    gun.cooldown = 0.32;
    if (c.isPlayer && audio) audio.dry();
    startReload(state, c, audio);
    return false;
  }
  gun.mag -= 1;
  gun.cooldown = 60 / def.rpm;
  gun.bloom = Math.min(def.bloomMax, gun.bloom + def.bloom);
  const eye = eyeOf(c);
  dirFrom(c.yaw, c.pitch, tmpDir);
  const spread = spreadFor(c, def);
  const muzzle = { x: eye.x + tmpDir.x * 0.55, y: eye.y - 0.14 + tmpDir.y * 0.55, z: eye.z + tmpDir.z * 0.55 };
  fx.muzzle(muzzle.x, muzzle.y, muzzle.z, c.yaw, c.pitch);
  if (audio) audio.shot(def.soundPitch, c.isPlayer ? undefined : c.pos.x, c.isPlayer ? undefined : c.pos.z);
  state.noises.push({ x: c.pos.x, z: c.pos.z, radius: 34, team: c.team, at: state.time });
  if (c.isPlayer) {
    c.punch += def.recoil;
    state.shake = Math.min(0.5, state.shake + def.kick * 0.045);
  }
  for (let p = 0; p < def.pellets; p += 1) {
    tmpDir2.copy(tmpDir);
    tmpDir2.x += (state.rng() * 2 - 1) * spread;
    tmpDir2.y += (state.rng() * 2 - 1) * spread;
    tmpDir2.z += (state.rng() * 2 - 1) * spread;
    tmpDir2.normalize();
    const hit = raycast(eye.x, eye.y, eye.z, tmpDir2.x, tmpDir2.y, tmpDir2.z, def.range, state.combatants, c);
    const end = hit ? hit.point : {
      x: eye.x + tmpDir2.x * def.range,
      y: eye.y + tmpDir2.y * def.range,
      z: eye.z + tmpDir2.z * def.range,
    };
    fx.tracer(muzzle.x, muzzle.y, muzzle.z, end.x, end.y, end.z);
    if (!hit) continue;
    if (hit.fighter) {
      let dmg = def.damage;
      if (hit.dist > def.falloffFrom) {
        const k = Math.min(1, (hit.dist - def.falloffFrom) / Math.max(1, def.range - def.falloffFrom));
        dmg *= 1 - (1 - def.falloffTo) * k;
      }
      const result = applyDamage(state, hit.fighter, dmg, hit.zone, def);
      fx.impact(hit.point.x, hit.point.y, hit.point.z, true);
      if (c.isPlayer) {
        state.hitmark = state.time;
        state.hitmarkKill = result === 'killed';
        if (audio) audio.hit(result === 'killed', hit.zone === 'head');
      }
      if (hit.fighter.isPlayer) {
        state.damageFrom = { x: c.pos.x, z: c.pos.z, at: state.time };
        state.shake = Math.min(0.6, state.shake + 0.16);
        if (audio) audio.hurt();
      }
      if (result === 'killed' && state.onKill) state.onKill(state, hit.fighter, c, hit.zone, def);
    } else {
      fx.impact(hit.point.x, hit.point.y, hit.point.z, false);
    }
  }
  if (gun.mag === 0) startReload(state, c, audio);
  return true;
}

// Per-step upkeep for every fighter's gun: cooldowns, bloom decay, reload completion.
export function stepWeapons(state, dt) {
  for (const c of state.combatants) {
    const gun = c.gun;
    if (!gun) continue;
    if (gun.cooldown > 0) gun.cooldown -= dt;
    gun.bloom = Math.max(0, gun.bloom - dt * 0.055);
    if (gun.reloading && state.time >= gun.reloadEnd) {
      const take = Math.min(gun.def.mag - gun.mag, gun.reserve);
      gun.mag += take;
      gun.reserve -= take;
      gun.reloading = false;
    }
  }
}

// --- Grenades: thrown arcs that bounce, then frag / flash / smoke on their fuse. ---

export function throwGrenade(state, c, fx, audio) {
  const kind = c.grenadeSel;
  if (!c.alive || c.grenades[kind] <= 0 || state.time < (c.grenadeCooldown || 0)) return false;
  c.grenades[kind] -= 1;
  c.grenadeCooldown = state.time + 0.55;
  const eye = eyeOf(c);
  dirFrom(c.yaw, c.pitch + 0.16, tmpDir);
  state.grenadeList.push({
    kind,
    owner: c,
    x: eye.x + tmpDir.x * 0.4,
    y: eye.y,
    z: eye.z + tmpDir.z * 0.4,
    vx: tmpDir.x * 13 + c.vel.x * 0.5,
    vy: tmpDir.y * 13 + 2.2,
    vz: tmpDir.z * 13 + c.vel.z * 0.5,
    fuseAt: state.time + GRENADES[kind].fuse,
  });
  if (audio && c.isPlayer) audio.throwIt();
  return true;
}

function explodeGrenade(state, g, fx, audio) {
  const def = GRENADES[g.kind];
  if (g.kind === 'frag') {
    fx.explosion(g.x, g.y, g.z);
    if (audio) audio.explosion(g.x, g.z);
    state.noises.push({ x: g.x, z: g.z, radius: 40, team: g.owner.team, at: state.time });
    state.shake = Math.min(0.7, state.shake + 0.2);
    const victims = explosionDamage(state, g.x, g.y, g.z, def.radius, def.damage, g.owner, WEAPONS.rifle);
    for (const v of victims) {
      if (v.fighter.isPlayer) {
        state.damageFrom = { x: g.x, z: g.z, at: state.time };
        if (audio) audio.hurt();
      }
      if (v.result === 'killed' && state.onKill) state.onKill(state, v.fighter, g.owner, 'grenade', null);
    }
  } else if (g.kind === 'flash') {
    if (audio) audio.flashPop(g.x, g.z);
    state.flashes.push({ x: g.x, y: g.y, z: g.z, at: state.time });
    for (const f of state.combatants) {
      if (!f.alive || f === g.owner) continue;
      const eye = eyeOf(f);
      const d = Math.hypot(eye.x - g.x, eye.y - g.y, eye.z - g.z);
      if (d > def.radius) continue;
      if (!lineOfSight(state, g.x, g.y, g.z, eye.x, eye.y, eye.z)) continue;
      dirFrom(f.yaw, f.pitch, tmpDir);
      tmpDir2.set(g.x - eye.x, g.y - eye.y, g.z - eye.z).normalize();
      const facing = tmpDir.dot(tmpDir2); // 1 = staring at it, -1 = back turned
      if (facing < -0.15) continue;
      const strength = Math.max(0.15, facing) * (1 - d / (def.radius * 1.6));
      f.blindUntil = Math.max(f.blindUntil, state.time + def.blindSeconds * Math.min(1, strength + 0.25));
    }
  } else {
    state.smokes.push({ x: g.x, y: 1.4, z: g.z, radius: def.radius, until: state.time + def.cloudSeconds });
    fx.smoke(g.x, g.z, def.cloudSeconds, state.time);
    if (audio) audio.smokeHiss(g.x, g.z);
  }
}

const grenadeGeo = new THREE.SphereGeometry(0.09, 8, 6);
const grenadeMats = {
  frag: new THREE.MeshStandardMaterial({ color: 0x4d5d3a, roughness: 0.6 }),
  flash: new THREE.MeshStandardMaterial({ color: 0xc8cdd2, roughness: 0.4, metalness: 0.5 }),
  smoke: new THREE.MeshStandardMaterial({ color: 0x707880, roughness: 0.5, metalness: 0.3 }),
};

export function stepGrenades(state, fx, audio, dt) {
  const list = state.grenadeList;
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const g = list[i];
    g.vy -= 12.5 * dt;
    g.x += g.vx * dt;
    g.y += g.vy * dt;
    g.z += g.vz * dt;
    if (g.y < 0.09) {
      g.y = 0.09;
      g.vy = Math.abs(g.vy) > 1.2 ? -g.vy * 0.38 : 0;
      g.vx *= 0.72;
      g.vz *= 0.72;
    }
    if (!g.mesh) {
      g.mesh = new THREE.Mesh(grenadeGeo, grenadeMats[g.kind]);
      fx.scene.add(g.mesh);
    }
    g.mesh.position.set(g.x, g.y, g.z);
    if (state.time >= g.fuseAt) {
      fx.scene.remove(g.mesh);
      list.splice(i, 1);
      explodeGrenade(state, g, fx, audio);
    }
  }
}

// --- First-person view models: one low-poly gun per weapon, built from boxes. ---

const vmMats = {
  body: new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.45, metalness: 0.55 }),
  grip: new THREE.MeshStandardMaterial({ color: 0x17181c, roughness: 0.8 }),
  accent: new THREE.MeshStandardMaterial({ color: 0xf2a33c, roughness: 0.5, metalness: 0.3 }),
  sight: new THREE.MeshStandardMaterial({ color: 0x0c0d10, roughness: 0.3, metalness: 0.6, emissive: 0x36f2c8, emissiveIntensity: 0.7 }),
};

function vmBox(group, w, h, d, x, y, z, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat || vmMats.body);
  m.position.set(x, y, z);
  group.add(m);
  return m;
}

export function createViewModel(defId) {
  const g = new THREE.Group();
  if (defId === 'sidearm') {
    vmBox(g, 0.055, 0.09, 0.24, 0, 0, 0);
    vmBox(g, 0.05, 0.13, 0.07, 0, -0.09, 0.07, vmMats.grip);
    vmBox(g, 0.012, 0.03, 0.012, 0, 0.06, -0.1, vmMats.sight);
  } else if (defId === 'smg') {
    vmBox(g, 0.06, 0.1, 0.44, 0, 0, -0.05);
    vmBox(g, 0.045, 0.16, 0.06, 0, -0.11, 0.02, vmMats.grip);
    vmBox(g, 0.05, 0.12, 0.05, 0, -0.1, -0.12, vmMats.grip);
    vmBox(g, 0.03, 0.05, 0.2, 0, 0.02, -0.36);
    vmBox(g, 0.014, 0.035, 0.014, 0, 0.075, -0.2, vmMats.sight);
  } else if (defId === 'shotgun') {
    vmBox(g, 0.07, 0.09, 0.62, 0, 0, -0.12);
    vmBox(g, 0.055, 0.05, 0.24, 0, -0.055, -0.3, vmMats.grip);
    vmBox(g, 0.05, 0.13, 0.06, 0, -0.09, 0.12, vmMats.grip);
    vmBox(g, 0.016, 0.03, 0.016, 0, 0.06, -0.42, vmMats.accent);
  } else if (defId === 'dmr') {
    vmBox(g, 0.055, 0.09, 0.78, 0, 0, -0.2);
    vmBox(g, 0.04, 0.07, 0.3, 0, 0.1, -0.12, vmMats.body); // scope tube
    vmBox(g, 0.05, 0.05, 0.06, 0, 0.1, -0.26, vmMats.sight);
    vmBox(g, 0.045, 0.15, 0.055, 0, -0.11, -0.02, vmMats.grip);
    vmBox(g, 0.045, 0.11, 0.05, 0, -0.09, 0.16, vmMats.grip);
    vmBox(g, 0.02, 0.02, 0.22, 0, -0.03, -0.62, vmMats.body); // bipod hint
  } else {
    // rifle
    vmBox(g, 0.06, 0.1, 0.58, 0, 0, -0.12);
    vmBox(g, 0.045, 0.17, 0.06, 0, -0.12, 0.0, vmMats.grip);
    vmBox(g, 0.05, 0.11, 0.05, 0, -0.09, -0.18, vmMats.grip);
    vmBox(g, 0.035, 0.04, 0.16, 0, 0.07, -0.1, vmMats.body);
    vmBox(g, 0.014, 0.03, 0.014, 0, 0.1, -0.1, vmMats.sight);
    vmBox(g, 0.03, 0.03, 0.14, 0, 0.01, -0.46, vmMats.accent);
  }
  g.position.set(0.24, -0.22, -0.45);
  return g;
}
