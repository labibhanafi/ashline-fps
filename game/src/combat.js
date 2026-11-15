// ASHLINE — combat math shared by the player and the bots: ray tests against the map's
// boxes and against fighters' bodies, line of sight, body collision, and damage.
// A fighter's body is three stacked boxes — legs, torso, head — scaled by his height, so a
// crouched fighter really is harder to hit and a headshot really is a smaller target.
import { BOXES, MAP_BOUNDS } from './mapdata.js';

const ZONES = [
  { name: 'head', from: 0.79, half: 0.17 },
  { name: 'torso', from: 0.44, half: 0.34 },
  { name: 'legs', from: 0.0, half: 0.33 },
];

// Ray vs one AABB (slab test). Returns the entry distance or -1. Boxes stand on y=0.
function rayBox(ox, oy, oz, dx, dy, dz, minX, minY, minZ, maxX, maxY, maxZ, maxDist) {
  let t0 = 0;
  let t1 = maxDist;
  if (Math.abs(dx) < 1e-9) {
    if (ox < minX || ox > maxX) return -1;
  } else {
    let ta = (minX - ox) / dx;
    let tb = (maxX - ox) / dx;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return -1;
  }
  if (Math.abs(dy) < 1e-9) {
    if (oy < minY || oy > maxY) return -1;
  } else {
    let ta = (minY - oy) / dy;
    let tb = (maxY - oy) / dy;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return -1;
  }
  if (Math.abs(dz) < 1e-9) {
    if (oz < minZ || oz > maxZ) return -1;
  } else {
    let ta = (minZ - oz) / dz;
    let tb = (maxZ - oz) / dz;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return -1;
  }
  return t0;
}

// The nearest thing a shot hits: {dist, point, fighter|null, zone|null, box|null}.
export function raycast(ox, oy, oz, dx, dy, dz, maxDist, fighters, ignore) {
  let best = maxDist;
  let hit = null;
  for (const b of BOXES) {
    const t = rayBox(ox, oy, oz, dx, dy, dz, b.minX, 0, b.minZ, b.maxX, b.maxY, b.maxZ, best);
    if (t >= 0 && t < best) {
      best = t;
      hit = { dist: t, fighter: null, zone: null, box: b };
    }
  }
  for (const f of fighters) {
    if (!f.alive || f === ignore) continue;
    for (const z of ZONES) {
      const y0 = f.pos.y + z.from * f.height;
      const y1 = z.name === 'head' ? f.pos.y + f.height : f.pos.y + (z.name === 'torso' ? 0.79 : 0.44) * f.height;
      const t = rayBox(ox, oy, oz, dx, dy, dz, f.pos.x - z.half, y0, f.pos.z - z.half, f.pos.x + z.half, y1, f.pos.z + z.half, best);
      if (t >= 0 && t < best) {
        best = t;
        hit = { dist: t, fighter: f, zone: z.name, box: null };
      }
    }
  }
  if (!hit) return null;
  hit.point = { x: ox + dx * best, y: oy + dy * best, z: oz + dz * best };
  return hit;
}

// Can eyes at A see point B? Blocked by any box, or by a live smoke cloud on the line.
export function lineOfSight(state, ax, ay, az, bx, by, bz) {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const dist = Math.hypot(dx, dy, dz);
  if (dist < 0.001) return true;
  const inv = 1 / dist;
  for (const b of BOXES) {
    const t = rayBox(ax, ay, az, dx * inv, dy * inv, dz * inv, b.minX, 0, b.minZ, b.maxX, b.maxY, b.maxZ, dist - 0.05);
    if (t >= 0) return false;
  }
  for (const s of state.smokes) {
    if (state.time > s.until) continue;
    // Segment-to-centre distance for the smoke sphere.
    const cx = s.x - ax;
    const cy = s.y - ay;
    const cz = s.z - az;
    const along = cx * dx * inv + cy * dy * inv + cz * dz * inv;
    if (along < 0 || along > dist) continue;
    const px = ax + dx * inv * along - s.x;
    const py = ay + dy * inv * along - s.y;
    const pz = az + dz * inv * along - s.z;
    if (px * px + py * py + pz * pz < s.radius * s.radius) return false;
  }
  return true;
}

// Move a body on the ground plane, sliding along boxes. Mutates pos by what was possible.
export function moveBody(pos, radius, dx, dz) {
  let nx = pos.x + dx;
  for (const b of BOXES) {
    if (nx + radius > b.minX && nx - radius < b.maxX && pos.z + radius > b.minZ && pos.z - radius < b.maxZ) {
      nx = dx > 0 ? b.minX - radius : b.maxX + radius;
    }
  }
  pos.x = Math.max(MAP_BOUNDS.minX, Math.min(MAP_BOUNDS.maxX, nx));
  let nz = pos.z + dz;
  for (const b of BOXES) {
    if (pos.x + radius > b.minX && pos.x - radius < b.maxX && nz + radius > b.minZ && nz - radius < b.maxZ) {
      nz = dz > 0 ? b.minZ - radius : b.maxZ + radius;
    }
  }
  pos.z = Math.max(MAP_BOUNDS.minZ, Math.min(MAP_BOUNDS.maxZ, nz));
}

// Damage with zone multiplier and armour absorption. Returns 'hit' or 'killed'.
// The caller (weapons.js) reports the kill so rounds.js can pay and score it.
export function applyDamage(state, target, raw, zone, def) {
  if (!target.alive) return 'hit';
  let dmg = raw;
  if (zone === 'head') dmg *= def.headMult;
  else if (zone === 'legs') dmg *= def.legMult;
  if (target.armor) dmg *= 0.55;
  target.hp -= dmg;
  target.lastHurtAt = state.time;
  if (target.hp <= 0) {
    target.hp = 0;
    target.alive = false;
    target.diedAt = state.time;
    return 'killed';
  }
  return 'hit';
}

// Area damage for the frag grenade: full at the centre, nothing at the rim, cover blocks.
export function explosionDamage(state, x, y, z, radius, maxDamage, attacker, def) {
  const victims = [];
  for (const f of state.combatants) {
    if (!f.alive || f === attacker) continue;
    const cx = f.pos.x;
    const cy = f.pos.y + f.height * 0.5;
    const cz = f.pos.z;
    const d = Math.hypot(cx - x, cy - y, cz - z);
    if (d > radius + 0.4) continue;
    if (!lineOfSight(state, x, y, z, cx, cy, cz)) continue;
    const scaled = maxDamage * Math.max(0, 1 - d / (radius + 0.4));
    if (scaled < 1) continue;
    const result = applyDamage(state, f, scaled, 'torso', def);
    victims.push({ fighter: f, result });
  }
  return victims;
}
