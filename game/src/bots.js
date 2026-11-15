// ASHLINE — the bots: fighters with the same body, guns and damage rules as the player,
// driven by a small brain. They see through a vision cone with line-of-sight checks, hear
// gunfire and running feet, route through the waypoint graph to a site, hold angles when
// they defend, plant and defuse the charge, and fight in bursts — stopping to shoot,
// strafing between bursts, crouching to reload, exactly the habits the gun model rewards.
import * as THREE from 'three';
import { BOT, PLAYER, WEAPONS, PALETTE } from './config.js';
import { NODES, nearestNode, findPath, SITES } from './mapdata.js';
import { lineOfSight, moveBody, raycast } from './combat.js';
import { eyeOf } from './player.js';
import { giveWeapon, tryFire, startReload, throwGrenade } from './weapons.js';

export const BOT_NAMES = {
  jackal: ['Ember', 'Rogue', 'Havoc', 'Venom'],
  warden: ['Vigil', 'Bastion', 'Sentry', 'Aegis'],
};

export function createBot(id, name, team) {
  return {
    id,
    name,
    isPlayer: false,
    team,
    alive: true,
    hp: 100,
    armor: false,
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    punch: 0,
    crouch: false,
    height: PLAYER.heightStand,
    eye: PLAYER.eyeStand,
    radius: PLAYER.radius,
    speedNow: 0,
    grounded: true,
    money: 0,
    gun: null,
    guns: { primary: null, sidearm: null },
    grenades: { frag: 0, flash: 0, smoke: 0 },
    grenadeSel: 'frag',
    grenadeCooldown: 0,
    blindUntil: 0,
    lastHurtAt: -9,
    diedAt: 0,
    stride: 0,
    mesh: null,
    brain: {
      site: null, // the site this bot plays for this round
      path: [],
      pathIdx: 0,
      goal: null, // {x, z} the bot is walking to right now
      target: null,
      lastSeenAt: -9,
      lastSeenPos: null,
      reactionAt: 0,
      burstLeft: 0,
      pauseUntil: 0,
      thinkAt: 0,
      strafeDir: 1,
      strafeAt: 0,
      scanYaw: 0,
      aimJitter: { x: 0, y: 0 },
      grenadeAt: 0,
      holdUntil: 0,
    },
  };
}

// --- Meshes: a low-poly trooper in team colours, gun forward, visor lit. ---

const sharedGeo = {
  leg: new THREE.BoxGeometry(0.17, 0.78, 0.2),
  torso: new THREE.BoxGeometry(0.52, 0.62, 0.3),
  head: new THREE.BoxGeometry(0.3, 0.3, 0.3),
  gun: new THREE.BoxGeometry(0.07, 0.12, 0.72),
  pack: new THREE.BoxGeometry(0.4, 0.44, 0.16),
};
const darkMat = new THREE.MeshStandardMaterial({ color: 0x2b2e33, roughness: 0.8 });
const visorMat = new THREE.MeshStandardMaterial({ color: 0x0c0d10, emissive: 0x9fe8ff, emissiveIntensity: 1.4 });

export function buildBotMesh(team) {
  const teamMat = new THREE.MeshStandardMaterial({ color: team === 'jackal' ? PALETTE.jackal : PALETTE.warden, roughness: 0.65 });
  const group = new THREE.Group();
  const legL = new THREE.Mesh(sharedGeo.leg, darkMat);
  legL.position.set(-0.13, 0.39, 0);
  const legR = new THREE.Mesh(sharedGeo.leg, darkMat);
  legR.position.set(0.13, 0.39, 0);
  const torso = new THREE.Mesh(sharedGeo.torso, teamMat);
  torso.position.y = 1.1;
  torso.castShadow = true;
  const pack = new THREE.Mesh(sharedGeo.pack, darkMat);
  pack.position.set(0, 1.12, 0.23);
  const head = new THREE.Mesh(sharedGeo.head, darkMat);
  head.position.y = 1.63;
  head.castShadow = true;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.07, 0.02), visorMat);
  visor.position.set(0, 1.66, -0.16);
  const gun = new THREE.Mesh(sharedGeo.gun, darkMat);
  gun.position.set(0.18, 1.24, -0.4);
  group.add(legL, legR, torso, pack, head, visor, gun);
  group.userData = { legL, legR, gun, torso };
  return group;
}

export function syncBotMesh(c, t) {
  const m = c.mesh;
  if (!m) return;
  m.position.copy(c.pos);
  m.rotation.set(0, c.yaw, 0);
  const u = m.userData;
  if (!c.alive) {
    const fall = Math.min(1, (t - c.diedAt) / 0.45);
    m.rotation.x = -fall * Math.PI * 0.5;
    m.position.y = c.pos.y - fall * 0.12;
    return;
  }
  m.rotation.x = 0;
  const walk = c.speedNow > 0.3 ? Math.sin(t * 10.5) * 0.4 * Math.min(1, c.speedNow / 3) : 0;
  u.legL.rotation.x = walk;
  u.legR.rotation.x = -walk;
  u.torso.position.y = 1.1 - (c.crouch ? 0.34 : 0) + Math.abs(Math.sin(t * 10.5)) * 0.02 * Math.min(1, c.speedNow / 3);
  u.gun.rotation.x = -c.pitch;
  const scaleY = c.crouch ? 0.78 : 1;
  m.scale.set(1, scaleY, 1);
}

// --- Round setup: loadouts bought from the bot's own money, roles for the round. ---

export function botBuy(state, c) {
  const rng = state.rng;
  if (!c.guns.sidearm) giveWeapon(c, 'sidearm');
  if (!c.guns.primary) {
    const picks = ['rifle', 'smg', 'shotgun', 'dmr'];
    for (const id of picks) {
      if (id === 'dmr' && rng() < 0.6) continue; // the Longbow stays rare
      if (c.money >= WEAPONS[id].price && rng() < 0.85) {
        c.money -= WEAPONS[id].price;
        giveWeapon(c, id);
        break;
      }
    }
  }
  if (!c.armor && c.money >= 650) {
    c.money -= 650;
    c.armor = true;
  }
  if (c.money >= 500) {
    if (c.grenades.frag === 0 && rng() < 0.4) { c.money -= 300; c.grenades.frag = 1; }
    if (c.grenades.flash === 0 && rng() < 0.3) { c.money -= 200; c.grenades.flash = 1; }
    if (c.grenades.smoke === 0 && rng() < 0.25) { c.money -= 300; c.grenades.smoke = 1; }
  }
  c.gun = c.guns.primary || c.guns.sidearm;
}

export function assignRoles(state) {
  const rng = state.rng;
  state.attackSite = SITES[rng() < 0.5 ? 0 : 1];
  const defenders = state.combatants.filter((c) => !c.isPlayer && c.team !== state.attackTeam);
  defenders.forEach((c, i) => {
    c.brain.site = i % 5 < 2 ? state.attackSite : SITES[state.attackSite === SITES[0] ? 1 : 0];
    if (i % 5 >= 2 && rng() < 0.5) c.brain.site = SITES[state.attackSite === SITES[0] ? 1 : 0];
  });
  for (const c of state.combatants) {
    if (c.isPlayer) continue;
    const b = c.brain;
    b.target = null;
    b.lastSeenAt = -9;
    b.lastSeenPos = null;
    b.path = [];
    b.pathIdx = 0;
    b.goal = null;
    b.burstLeft = 0;
    if (c.team === state.attackTeam) b.site = state.attackSite;
  }
}

// --- Perception and decisions. ---

function canSee(state, c, f) {
  if (state.time < c.blindUntil) return false;
  const eye = eyeOf(c);
  const dx = f.pos.x - eye.x;
  const dz = f.pos.z - eye.z;
  const dist = Math.hypot(dx, dz);
  if (dist > BOT.visionRange) return false;
  if (dist > 5) {
    const fx = -Math.sin(c.yaw);
    const fz = -Math.cos(c.yaw);
    if ((dx * fx + dz * fz) / dist < BOT.visionCos) return false;
  }
  const ty = f.pos.y + f.height * 0.62;
  return lineOfSight(state, eye.x, eye.y, eye.z, f.pos.x, ty, f.pos.z);
}

function perceive(state, c) {
  const b = c.brain;
  let seen = null;
  let seenDist = Infinity;
  for (const f of state.combatants) {
    if (!f.alive || f.team === c.team) continue;
    if (canSee(state, c, f)) {
      const d = Math.hypot(f.pos.x - c.pos.x, f.pos.z - c.pos.z);
      if (d < seenDist) {
        seenDist = d;
        seen = f;
      }
    }
  }
  if (seen) {
    if (b.target !== seen) {
      b.reactionAt = state.time + BOT.reactionSeconds * (0.75 + state.rng() * 0.6);
      b.burstLeft = 0;
    }
    b.target = seen;
    b.lastSeenAt = state.time;
    b.lastSeenPos = { x: seen.pos.x, z: seen.pos.z };
    return;
  }
  if (b.target && !b.target.alive) b.target = null;
  if (state.time - b.lastSeenAt > 5) b.target = null;
  // Hearing: a fresh enemy noise inside its radius pulls the bot's attention.
  for (const n of state.noises) {
    if (n.team === c.team || state.time - n.at > 0.4) continue;
    if (Math.hypot(n.x - c.pos.x, n.z - c.pos.z) < n.radius && state.time - b.lastSeenAt > 1.2) {
      b.lastSeenAt = state.time - 2.2; // stale on purpose: a direction, not a lock
      b.lastSeenPos = { x: n.x, z: n.z };
    }
  }
}

function setGoalPath(state, c, tx, tz) {
  const b = c.brain;
  const from = nearestNode(c.pos.x, c.pos.z);
  const to = nearestNode(tx, tz);
  b.path = findPath(from, to);
  b.pathIdx = 0;
  b.goal = { x: tx, z: tz };
}

function currentWaypoint(c) {
  const b = c.brain;
  if (b.pathIdx < b.path.length) {
    const n = NODES[b.path[b.pathIdx]];
    return { x: n.x, z: n.z, node: true };
  }
  return b.goal;
}

function stepBot(state, c, fx, audio, dt) {
  const b = c.brain;
  perceive(state, c);
  const now = state.time;
  const targetVisible = b.target && b.target.alive && canSee(state, c, b.target);
  const planted = state.charge.state === 'planted';

  // Decide where to be (throttled; movement and firing run every step).
  if (now >= b.thinkAt) {
    b.thinkAt = now + 0.14 + state.rng() * 0.05;
    let goal = null;
    if (targetVisible) {
      goal = null; // combat movement takes over below
    } else if (planted && state.charge.site) {
      goal = { x: state.charge.site.x, z: state.charge.site.z }; // everyone converges
    } else if (b.lastSeenPos && now - b.lastSeenAt < 4) {
      goal = b.lastSeenPos;
    } else if (c.team === state.attackTeam) {
      if (state.charge.state === 'dropped' && !state.charge.carrier && c.id % 3 === 0) {
        goal = { x: state.charge.pos.x, z: state.charge.pos.z }; // one attacker fetches it
      } else {
        goal = { x: b.site.x, z: b.site.z };
      }
    } else {
      goal = { x: b.site.x + (c.id % 3 - 1) * 2.4, z: b.site.z + ((c.id + 1) % 3 - 1) * 2.4 };
    }
    if (goal) {
      const wp = currentWaypoint(c);
      if (!wp || Math.hypot(wp.x - goal.x, wp.z - goal.z) > 2.5) setGoalPath(state, c, goal.x, goal.z);
    } else {
      b.goal = null;
      b.path = [];
    }
    // A frag for a corner the enemy was just seen behind.
    if (c.grenades.frag > 0 && !targetVisible && b.lastSeenPos && now - b.lastSeenAt < 2.5 && now > b.grenadeAt) {
      const d = Math.hypot(b.lastSeenPos.x - c.pos.x, b.lastSeenPos.z - c.pos.z);
      if (d > 9 && d < 21) {
        b.grenadeAt = now + 6;
        c.grenadeSel = 'frag';
        c.yaw = Math.atan2(-(b.lastSeenPos.x - c.pos.x), -(b.lastSeenPos.z - c.pos.z));
        c.pitch = 0.34;
        throwGrenade(state, c, fx, audio);
      }
    }
    if (c.gun && (c.gun.mag === 0 || (c.gun.mag <= 4 && !targetVisible))) startReload(state, c, null);
  }

  // Aim and fire.
  let moveX = 0;
  let moveZ = 0;
  let wantCrouch = false;
  if (targetVisible) {
    const t = b.target;
    const dx = t.pos.x - c.pos.x;
    const dz = t.pos.z - c.pos.z;
    const dist = Math.hypot(dx, dz);
    const desiredYaw = Math.atan2(-dx, -dz);
    c.yaw = turnToward(c.yaw, desiredYaw, dt * 7);
    const eye = eyeOf(c);
    const aimY = t.pos.y + t.height * (state.rng() < 0.24 ? 0.86 : 0.6);
    c.pitch = Math.atan2(aimY - eye.y, dist) + b.aimJitter.y;
    if (now >= b.reactionAt && state.time >= c.blindUntil) {
      if (b.burstLeft > 0) {
        // Walk the aim onto the target a little more with each burst round — but never
        // through a teammate: if the first body on the line is friendly, hold fire.
        c.yaw = turnToward(c.yaw, desiredYaw + b.aimJitter.x, dt * 9);
        const eye = eyeOf(c);
        const cp = Math.cos(c.pitch);
        const blocking = raycast(eye.x, eye.y, eye.z, -Math.sin(c.yaw) * cp, Math.sin(c.pitch), -Math.cos(c.yaw) * cp, dist + 2, state.combatants, c);
        if (!(blocking && blocking.fighter && blocking.fighter.team === c.team)) {
          if (tryFire(state, c, fx, audio)) b.burstLeft -= 1;
        }
      } else if (now >= b.pauseUntil) {
        b.burstLeft = BOT.burstMin + Math.floor(state.rng() * (BOT.burstMax - BOT.burstMin));
        const err = BOT.aimErrorBase * (1 + dist * 0.03 + (t.speedNow || 0) * 0.25);
        b.aimJitter = { x: (state.rng() * 2 - 1) * err * 1.6, y: (state.rng() * 2 - 1) * err * 1.2 };
        b.pauseUntil = now + BOT.burstPause * (0.7 + state.rng() * 0.7);
      }
    }
    // Combat movement: strafe in the open, press a wounded or blind enemy, hold a strong one.
    if (now >= b.strafeAt) {
      b.strafeAt = now + 0.6 + state.rng() * 0.9;
      b.strafeDir = state.rng() < 0.5 ? -1 : 1;
    }
    const press = t.hp < 40 || state.time < t.blindUntil;
    if (dist > (press ? 4 : 13)) {
      moveX = dx / dist;
      moveZ = dz / dist;
    } else if (dist < 6 && !press) {
      moveX = -dx / dist;
      moveZ = -dz / dist;
    } else {
      moveX = (-dz / dist) * b.strafeDir;
      moveZ = (dx / dist) * b.strafeDir;
    }
    wantCrouch = !!(c.gun && c.gun.reloading);
  } else {
    const wp = currentWaypoint(c);
    if (wp) {
      const dx = wp.x - c.pos.x;
      const dz = wp.z - c.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < (wp.node ? 1.1 : 0.8)) {
        if (wp.node) b.pathIdx += 1;
        else b.goal = null;
      } else {
        moveX = dx / dist;
        moveZ = dz / dist;
        c.yaw = turnToward(c.yaw, Math.atan2(-dx, -dz), dt * 6);
        c.pitch *= 0.9;
      }
    } else {
      // Holding: settle, scan the lane slowly, crouch behind the low cover sometimes.
      b.scanYaw += dt * 0.24;
      c.yaw = turnToward(c.yaw, c.brain.baseYaw !== undefined ? c.brain.baseYaw + Math.sin(b.scanYaw) * 0.65 : c.yaw, dt * 2.5);
      wantCrouch = c.id % 2 === 0;
    }
  }
  if (c.brain.baseYaw === undefined && !targetVisible) c.brain.baseYaw = c.yaw;

  c.crouch = wantCrouch;
  c.height = c.crouch ? PLAYER.heightCrouch : PLAYER.heightStand;
  c.eye = c.crouch ? PLAYER.eyeCrouch : PLAYER.eyeStand;
  const speed = targetVisible ? BOT.speed * 0.62 : BOT.speed;
  const mx = moveX * speed * dt;
  const mz = moveZ * speed * dt;
  const beforeX = c.pos.x;
  const beforeZ = c.pos.z;
  if (mx !== 0 || mz !== 0) moveBody(c.pos, c.radius, mx, mz);
  c.speedNow = Math.hypot(c.pos.x - beforeX, c.pos.z - beforeZ) / Math.max(dt, 0.001);
  c.vel.set(moveX * speed, 0, moveZ * speed);
  if (c.grounded !== false && c.speedNow > 3) {
    c.stride += c.speedNow * dt;
    if (c.stride > 2.2) {
      c.stride = 0;
      state.noises.push({ x: c.pos.x, z: c.pos.z, radius: 9, team: c.team, at: now });
    }
  }
}

function turnToward(angle, target, maxStep) {
  let diff = target - angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  if (Math.abs(diff) <= maxStep) return target;
  return angle + Math.sign(diff) * maxStep;
}

export function stepBots(state, fx, audio, dt) {
  for (const c of state.combatants) {
    if (c.isPlayer || !c.alive) continue;
    if (state.phase === 'live') stepBot(state, c, fx, audio, dt);
  }
}
