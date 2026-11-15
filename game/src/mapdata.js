// ASHLINE — the map "Kestrel Yard" as data: every solid box, both charge sites, the spawn
// points and the waypoint graph the bots route through. world.js turns these boxes into
// meshes; combat.js and the movement code test rays and bodies against the same list, so
// what you see is exactly what blocks you. Coordinates are metres, x east, z south, y up.
// A box is {x, z, w, d, h, kind}: centre, footprint, height from the ground.

const B = (x, z, w, d, h, kind, color) => ({ x, z, w, d, h, kind, color: color ?? -1 });

export const BOXES = [
  // Perimeter walls.
  B(-38, 0, 1.2, 61.2, 5, 'wall'), B(38, 0, 1.2, 61.2, 5, 'wall'),
  B(0, -30, 77.2, 1.2, 5, 'wall'), B(0, 30, 77.2, 1.2, 5, 'wall'),
  // Site A — the Crane Yard (north-west). Crane legs first, then its container ring.
  B(-29, -19, 0.7, 0.7, 9.5, 'leg'), B(-19, -19, 0.7, 0.7, 9.5, 'leg'),
  B(-29, -7, 0.7, 0.7, 9.5, 'leg'), B(-19, -7, 0.7, 0.7, 9.5, 'leg'),
  B(-24, -21.5, 6, 2.44, 5.2, 'stack', 1),
  B(-31.5, -13, 2.44, 6, 2.6, 'container', 0),
  B(-16.5, -13, 2.44, 6, 2.6, 'container', 2),
  B(-21, -9.5, 1.3, 1.3, 2.6, 'crate'),
  B(-27.5, -16.5, 1.3, 1.3, 1.3, 'crate'),
  B(-24, -6.2, 4, 0.6, 1.05, 'low'),
  // Site B — the Depot (south-east), with its office block and tank.
  B(33, 5, 8, 6, 4.5, 'office'),
  B(33, 23, 4, 4, 4.4, 'tank'),
  B(18.5, 8, 2.44, 6, 2.6, 'container', 3),
  B(25, 22.5, 6, 2.44, 5.2, 'stack', 4),
  B(19, 20, 6, 2.44, 2.6, 'container', 5),
  B(28.5, 10, 1.3, 1.3, 1.3, 'crate'),
  B(21.5, 16.5, 1.3, 1.3, 2.6, 'crate'),
  B(25, 7.2, 4, 0.6, 1.05, 'low'),
  // Mid — the crossing both teams fight over.
  B(-4, -3, 6, 2.44, 5.2, 'stack', 2),
  B(4.5, 3.5, 2.44, 6, 2.6, 'container', 1),
  B(-2, 9.5, 6, 2.44, 2.6, 'container', 0),
  B(7.5, -6.5, 1.3, 1.3, 2.6, 'crate'),
  B(-9.5, -8.5, 1.3, 1.3, 1.3, 'crate'),
  B(0, -8.5, 4, 0.6, 1.05, 'low'),
  B(-6.5, 4.5, 0.6, 3.4, 1.05, 'low'),
  B(12, -14, 4, 4, 4.4, 'tank'),
  B(14, 6, 6, 2.44, 2.6, 'container', 4),
  B(-16, -1, 2.44, 6, 2.6, 'container', 5),
  // West lane: attacker spawn up to A.
  B(-33.5, 4, 2.44, 6, 2.6, 'container', 3),
  B(-25, 10.5, 1.3, 1.3, 1.3, 'crate'),
  B(-28, -0.5, 0.6, 3.4, 1.05, 'low'),
  // South connector: attacker spawn east to B.
  B(-8, 25.5, 6, 2.44, 2.6, 'container', 1),
  B(8, 26, 6, 2.44, 5.2, 'stack', 0),
  B(0, 20, 1.3, 1.3, 1.3, 'crate'),
  // North connector: A across to the defender side.
  B(-8, -24.5, 6, 2.44, 2.6, 'container', 4),
  B(8, -25, 6, 2.44, 5.2, 'stack', 3),
  B(18, -18, 1.3, 1.3, 1.3, 'crate'),
  // Defender ground between spawn and the sites.
  B(24, -14, 2.44, 6, 2.6, 'container', 2),
  B(16, -22, 4, 0.6, 1.05, 'low'),
  // Attacker spawn dressing.
  B(-33, 16.5, 1.3, 1.3, 1.3, 'crate'),
  B(-20, 27, 6, 2.44, 2.6, 'container', 2),
];

// Precomputed min/max corners for the ray and body tests.
for (const b of BOXES) {
  b.minX = b.x - b.w / 2; b.maxX = b.x + b.w / 2;
  b.minZ = b.z - b.d / 2; b.maxZ = b.z + b.d / 2;
  b.maxY = b.h;
}

export const SITES = [
  { letter: 'A', name: 'Crane Yard', x: -24, z: -13, r: 6.5 },
  { letter: 'B', name: 'Depot', x: 25, z: 14, r: 6.5 },
];

export const SPAWNS = {
  jackal: [[-31, 20], [-28, 23.5], [-25, 20], [-30, 25.5], [-25.5, 25]],
  warden: [[25, -24], [28, -20], [31, -23], [26, -18.5], [30.5, -25.5]],
};
export const BUY_RADIUS = 8;

export const MAP_BOUNDS = { minX: -37.3, maxX: 37.3, minZ: -29.3, maxZ: 29.3 };

// Waypoint graph. Bots path spawn -> lane -> site through these nodes; defenders hold the
// starred ones near their site. Edges are walkable straight lines (cover sits off the lines).
export const NODES = [
  { x: -28, z: 21 }, // 0 attacker spawn
  { x: -16, z: 15 }, // 1
  { x: -3, z: 15 }, // 2 mid-south
  { x: 0, z: 1 }, // 3 mid
  { x: -13, z: 2 }, // 4 mid-west
  { x: -28, z: 7 }, // 5 A lane
  { x: -27, z: -3 }, // 6 A lane
  { x: -24, z: -13 }, // 7 site A
  { x: -15, z: -19 }, // 8 A north
  { x: -2, z: -21 }, // 9 north-mid
  { x: 14, z: -21 }, // 10 defender north
  { x: 28, z: -21 }, // 11 defender spawn
  { x: 27, z: -9 }, // 12 B lane
  { x: 28, z: 3 }, // 13 B lane
  { x: 25, z: 14 }, // 14 site B
  { x: 13, z: 21 }, // 15 B south
  { x: 1, z: 24 }, // 16 south-mid
  { x: 13, z: 4 }, // 17 mid-east
  { x: 3, z: -13 }, // 18 mid-north
  { x: -14, z: 24 }, // 19 attacker south
];

const EDGES = [
  [0, 1], [0, 5], [0, 19], [19, 16], [16, 15], [15, 14], [15, 17],
  [1, 2], [1, 4], [2, 3], [2, 16], [3, 4], [3, 17], [3, 18],
  [4, 6], [4, 8], [5, 6], [6, 7], [7, 8], [8, 9], [9, 18], [9, 10],
  [10, 11], [10, 12], [11, 12], [12, 13], [13, 14], [13, 17], [14, 17],
  [17, 18], [18, 12],
];

export const ADJACENCY = NODES.map(() => []);
for (const [a, b] of EDGES) {
  ADJACENCY[a].push(b);
  ADJACENCY[b].push(a);
}

export function nearestNode(x, z) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < NODES.length; i += 1) {
    const dx = NODES[i].x - x;
    const dz = NODES[i].z - z;
    const d = dx * dx + dz * dz;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

// Breadth-first next-hop path between two nodes, as a list of node indices (start excluded).
export function findPath(from, to) {
  if (from === to) return [];
  const prev = new Array(NODES.length).fill(-1);
  const queue = [from];
  prev[from] = from;
  while (queue.length > 0) {
    const cur = queue.shift();
    if (cur === to) break;
    for (const next of ADJACENCY[cur]) {
      if (prev[next] === -1) {
        prev[next] = cur;
        queue.push(next);
      }
    }
  }
  if (prev[to] === -1) return [];
  const path = [];
  let cur = to;
  while (cur !== from) {
    path.push(cur);
    cur = prev[cur];
  }
  path.reverse();
  return path;
}

export function siteAt(x, z) {
  for (const s of SITES) {
    const dx = x - s.x;
    const dz = z - s.z;
    if (dx * dx + dz * dz <= s.r * s.r) return s;
  }
  return null;
}
