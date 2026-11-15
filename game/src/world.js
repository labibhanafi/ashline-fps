// ASHLINE — the visible yard: builds three.js meshes for every box in mapdata.js, with
// procedural canvas textures (asphalt, corrugated steel, concrete, crate wood, lit office
// windows) so the game ships zero image assets. Dusk light: one shadow-casting sun, a
// hemisphere fill, and warm lamps over both sites and mid.
import * as THREE from 'three';
import { PALETTE } from './config.js';
import { BOXES, SITES } from './mapdata.js';

function canvasTexture(size, draw, repeatX = 1, repeatY = 1) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  draw(c.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function speckle(ctx, s, n, alpha, light) {
  for (let i = 0; i < n; i += 1) {
    const v = Math.floor(Math.random() * 60) - 30;
    ctx.fillStyle = `rgba(${light ? 200 + v : 20 - v},${light ? 200 + v : 20 - v},${light ? 200 + v : 22 - v},${alpha})`;
    ctx.fillRect(Math.random() * s, Math.random() * s, 2, 2);
  }
}

const asphaltTex = () => canvasTexture(512, (ctx, s) => {
  ctx.fillStyle = '#3b4046';
  ctx.fillRect(0, 0, s, s);
  speckle(ctx, s, 2600, 0.16, false);
  speckle(ctx, s, 900, 0.1, true);
  ctx.strokeStyle = 'rgba(20,22,25,0.5)';
  ctx.lineWidth = 3;
  ctx.strokeRect(1, 1, s - 2, s - 2); // expansion joints between slabs
}, 10, 8);

const concreteTex = () => canvasTexture(256, (ctx, s) => {
  ctx.fillStyle = '#8b8f8c';
  ctx.fillRect(0, 0, s, s);
  speckle(ctx, s, 1500, 0.14, false);
  ctx.fillStyle = 'rgba(40,42,44,0.25)';
  ctx.fillRect(0, s - 14, s, 14); // weather stain at the foot
}, 2, 1);

const corrugatedTex = () => canvasTexture(256, (ctx, s) => {
  ctx.fillStyle = '#cfd2d4'; // near-white: the material colour does the painting
  ctx.fillRect(0, 0, s, s);
  for (let x = 0; x < s; x += 16) {
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(x, 0, 5, s);
    ctx.fillStyle = 'rgba(255,255,255,0.20)';
    ctx.fillRect(x + 8, 0, 4, s);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, 0, s, 10);
  ctx.fillRect(0, s - 10, s, 10);
  speckle(ctx, s, 500, 0.12, false);
}, 2, 1);

const crateTex = () => canvasTexture(256, (ctx, s) => {
  ctx.fillStyle = '#9a7b4f';
  ctx.fillRect(0, 0, s, s);
  ctx.strokeStyle = 'rgba(60,40,18,0.65)';
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, s - 10, s - 10);
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(s, s);
  ctx.moveTo(s, 0); ctx.lineTo(0, s);
  ctx.lineWidth = 7;
  ctx.stroke();
  speckle(ctx, s, 700, 0.12, false);
}, 1, 1);

const officeTex = () => canvasTexture(256, (ctx, s) => {
  ctx.fillStyle = '#565b63';
  ctx.fillRect(0, 0, s, s);
  speckle(ctx, s, 800, 0.12, false);
  for (let y = 24; y < s - 20; y += 44) {
    for (let x = 18; x < s - 30; x += 40) {
      const lit = Math.random() < 0.55;
      ctx.fillStyle = lit ? '#ffd489' : '#232a31';
      ctx.fillRect(x, y, 26, 30);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(x, y + 14, 26, 2);
    }
  }
}, 2, 1);

const steelTex = () => canvasTexture(128, (ctx, s) => {
  ctx.fillStyle = '#5a5148';
  ctx.fillRect(0, 0, s, s);
  speckle(ctx, s, 500, 0.2, false);
  ctx.fillStyle = 'rgba(242,163,60,0.85)'; // hazard band
  ctx.fillRect(0, s - 22, s, 22);
}, 1, 3);

function siteDecal(site) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.strokeStyle = site.letter === 'A' ? '#f2a33c' : '#35c4b5';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(128, 128, 112, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = ctx.strokeStyle;
  ctx.font = 'bold 120px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.globalAlpha = 0.85;
  ctx.fillText(site.letter, 128, 134);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(site.r * 2, site.r * 2),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(site.x, 0.03, site.z);
  return mesh;
}

export function createWorld(scene) {
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.fog, 34, 110);

  const hemi = new THREE.HemisphereLight(0x8ea6c4, 0x2c2f33, 0.75);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffc98a, 1.5);
  sun.position.set(-38, 30, -20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -52;
  sun.shadow.camera.right = 52;
  sun.shadow.camera.top = 44;
  sun.shadow.camera.bottom = -44;
  sun.shadow.camera.far = 130;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  const lampA = new THREE.PointLight(0xffa64d, 260, 34, 1.9);
  lampA.position.set(-24, 7.6, -13);
  scene.add(lampA);
  const lampB = new THREE.PointLight(0x9fd8ff, 200, 32, 1.9);
  lampB.position.set(25, 6.4, 14);
  scene.add(lampB);
  const lampMid = new THREE.PointLight(0xffc98a, 150, 30, 1.9);
  lampMid.position.set(0, 6.2, 1);
  scene.add(lampMid);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(90, 74),
    new THREE.MeshStandardMaterial({ map: asphaltTex(), roughness: 0.94, metalness: 0.02 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  for (const site of SITES) scene.add(siteDecal(site));

  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const texByKind = {
    wall: new THREE.MeshStandardMaterial({ map: concreteTex(), roughness: 0.9 }),
    office: new THREE.MeshStandardMaterial({ map: officeTex(), roughness: 0.85 }),
    crate: new THREE.MeshStandardMaterial({ map: crateTex(), roughness: 0.9 }),
    low: new THREE.MeshStandardMaterial({ map: concreteTex(), roughness: 0.9 }),
    leg: new THREE.MeshStandardMaterial({ map: steelTex(), roughness: 0.6, metalness: 0.5 }),
    tank: new THREE.MeshStandardMaterial({ color: 0x7e8894, roughness: 0.45, metalness: 0.65 }),
  };
  const containerMats = PALETTE.containers.map((color) => new THREE.MeshStandardMaterial({
    map: corrugatedTex(), color, roughness: 0.62, metalness: 0.35,
  }));

  for (const b of BOXES) {
    if (b.kind === 'tank') {
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(b.w / 2, b.w / 2, b.h, 20), texByKind.tank);
      tank.position.set(b.x, b.h / 2, b.z);
      tank.castShadow = true;
      tank.receiveShadow = true;
      scene.add(tank);
      continue;
    }
    const mat = (b.kind === 'container' || b.kind === 'stack')
      ? containerMats[(b.color + PALETTE.containers.length) % PALETTE.containers.length]
      : texByKind[b.kind];
    const mesh = new THREE.Mesh(unitBox, mat);
    mesh.scale.set(b.w, b.h, b.d);
    mesh.position.set(b.x, b.h / 2, b.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  // The crane over Site A: two beams and a hook block the colliders do not need.
  const steel = texByKind.leg;
  const beamGeo = new THREE.BoxGeometry(11.4, 0.8, 0.8);
  for (const z of [-19, -7]) {
    const beam = new THREE.Mesh(beamGeo, steel);
    beam.position.set(-24, 9.7, z);
    beam.castShadow = true;
    scene.add(beam);
  }
  const cross = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 13.4), steel);
  cross.position.set(-24, 10.4, -13);
  cross.castShadow = true;
  scene.add(cross);
  const hook = new THREE.Group();
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.4, 6), steel);
  cable.position.y = -1.7;
  hook.add(cable);
  const block = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.1, 0.9), new THREE.MeshStandardMaterial({ color: 0xd8b13a, roughness: 0.5, metalness: 0.4 }));
  block.position.y = -3.8;
  block.castShadow = true;
  hook.add(block);
  hook.position.set(-25.5, 10.2, -12);
  scene.add(hook);

  // Lamp posts around the lanes (emissive heads; the three real lights live above).
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.6, metalness: 0.5 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0x554a33, emissive: 0xffb45e, emissiveIntensity: 2.2 });
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 6.2, 6);
  const headGeo = new THREE.BoxGeometry(0.7, 0.18, 0.4);
  for (const [x, z] of [[-28, 14], [-13, -13], [6, 12], [18, -6], [-2, 20], [24, -2], [-34, -22], [34, 26]]) {
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(x, 3.1, z);
    scene.add(pole);
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.set(x, 6.25, z);
    scene.add(head);
  }

  // Skyline silhouettes beyond the walls, so the horizon is not a void.
  const silhouette = new THREE.MeshStandardMaterial({ color: 0x141c26, roughness: 1 });
  for (const [x, z, w, h, d] of [[-58, -18, 22, 17, 14], [54, -30, 26, 21, 16], [58, 22, 18, 13, 18], [-56, 26, 24, 12, 12], [4, -52, 34, 15, 14], [-16, 50, 28, 19, 12]]) {
    const m = new THREE.Mesh(unitBox, silhouette);
    m.scale.set(w, h, d);
    m.position.set(x, h / 2, z);
    scene.add(m);
  }

  return {
    update(t) {
      hook.position.x = -25.5 + Math.sin(t * 0.24) * 0.8; // the crane hook sways, barely
      hook.rotation.z = Math.sin(t * 0.24) * 0.03;
    },
  };
}

// The charge: a breaching block with a keypad and an arming light. rounds.js moves it
// (carrier's back, the ground where it fell, the site where it is planted).
export function createChargeMesh(scene) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.52, 0.34, 0.2),
    new THREE.MeshStandardMaterial({ color: 0x2e3236, roughness: 0.5, metalness: 0.4 }),
  );
  body.castShadow = true;
  group.add(body);
  const lightMat = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2222, emissiveIntensity: 0.6 });
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.03), lightMat);
  lamp.position.set(0.14, 0.07, 0.11);
  group.add(lamp);
  const pad = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.14, 0.02),
    new THREE.MeshStandardMaterial({ color: 0x11151a, emissive: 0x2a4a66, emissiveIntensity: 0.7 }),
  );
  pad.position.set(-0.1, 0, 0.11);
  group.add(pad);
  group.visible = false;
  scene.add(group);
  return {
    group,
    setBlink(t, planted) {
      lightMat.emissiveIntensity = planted ? (Math.sin(t * 9) > 0 ? 3.2 : 0.2) : 0.8;
    },
  };
}
