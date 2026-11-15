// ASHLINE — transient visuals, all pooled: tracer lines, muzzle flashes, impact sparks,
// explosion fireballs and smoke clouds. Nothing here allocates in the frame loop; pools
// are sized once and recycled, and update() advances every live effect by dt.
import * as THREE from 'three';

const TRACERS = 40;
const SPARKS = 320;
const SMOKES = 10;

export function createEffects(scene) {
  // Tracers: one LineSegments with a fixed vertex buffer; dead tracers collapse to a point.
  const tracerPos = new Float32Array(TRACERS * 6);
  const tracerGeo = new THREE.BufferGeometry();
  tracerGeo.setAttribute('position', new THREE.BufferAttribute(tracerPos, 3));
  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe2b0, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  const tracerLines = new THREE.LineSegments(tracerGeo, tracerMat);
  tracerLines.frustumCulled = false;
  scene.add(tracerLines);
  const tracerLife = new Float32Array(TRACERS);
  let tracerCursor = 0;

  // Sparks: one Points cloud with per-particle velocity and life kept in plain arrays.
  const sparkPos = new Float32Array(SPARKS * 3);
  const sparkVel = new Float32Array(SPARKS * 3);
  const sparkLife = new Float32Array(SPARKS);
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparkMat = new THREE.PointsMaterial({ color: 0xffc37a, size: 0.055, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  const sparkPoints = new THREE.Points(sparkGeo, sparkMat);
  sparkPoints.frustumCulled = false;
  scene.add(sparkPoints);
  let sparkCursor = 0;
  for (let i = 0; i < SPARKS; i += 1) sparkPos[i * 3 + 1] = -50;

  // One shared flash light: muzzle flashes and explosions fight over it, brightest wins.
  const flash = new THREE.PointLight(0xffb45e, 0, 17, 1.8);
  scene.add(flash);
  let flashLife = 0;

  // Muzzle flash billboards.
  const muzzleMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const muzzles = [];
  for (let i = 0; i < 6; i += 1) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), muzzleMat.clone());
    m.visible = false;
    scene.add(m);
    muzzles.push({ mesh: m, life: 0 });
  }
  let muzzleCursor = 0;

  // Smoke clouds: a cluster of soft spheres that grows, hangs, and thins.
  const smokeMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a4, transparent: true, opacity: 0, roughness: 1, depthWrite: false });
  const smokes = [];
  for (let i = 0; i < SMOKES; i += 1) {
    const group = new THREE.Group();
    const puffs = [];
    for (let j = 0; j < 5; j += 1) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), smokeMat.clone());
      puff.position.set((j % 3 - 1) * 1.1, 0.7 + (j % 2) * 0.8, (Math.floor(j / 3) - 0.5) * 1.6);
      group.add(puff);
      puffs.push(puff);
    }
    group.visible = false;
    scene.add(group);
    smokes.push({ group, puffs, until: -1, born: 0, life: 1 });
  }

  // Explosion fireball: one sphere that swells and dies in a third of a second.
  const fireball = new THREE.Mesh(
    new THREE.SphereGeometry(1, 14, 10),
    new THREE.MeshBasicMaterial({ color: 0xffa63e, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  fireball.visible = false;
  scene.add(fireball);
  let fireLife = 0;

  function burst(x, y, z, count, speed, spread, up) {
    for (let n = 0; n < count; n += 1) {
      const i = sparkCursor;
      sparkCursor = (sparkCursor + 1) % SPARKS;
      sparkPos[i * 3] = x;
      sparkPos[i * 3 + 1] = y;
      sparkPos[i * 3 + 2] = z;
      sparkVel[i * 3] = (Math.random() * 2 - 1) * speed;
      sparkVel[i * 3 + 1] = Math.random() * up;
      sparkVel[i * 3 + 2] = (Math.random() * 2 - 1) * speed;
      sparkLife[i] = 0.25 + Math.random() * spread;
    }
  }

  return {
    scene, // weapons.js parks live grenade meshes here
    tracer(x0, y0, z0, x1, y1, z1) {
      const i = tracerCursor;
      tracerCursor = (tracerCursor + 1) % TRACERS;
      tracerPos[i * 6] = x0;
      tracerPos[i * 6 + 1] = y0;
      tracerPos[i * 6 + 2] = z0;
      tracerPos[i * 6 + 3] = x1;
      tracerPos[i * 6 + 4] = y1;
      tracerPos[i * 6 + 5] = z1;
      tracerLife[i] = 0.055;
      tracerGeo.attributes.position.needsUpdate = true;
    },
    muzzle(x, y, z, yaw, pitch) {
      const slot = muzzles[muzzleCursor];
      muzzleCursor = (muzzleCursor + 1) % muzzles.length;
      slot.mesh.position.set(x, y, z);
      slot.mesh.rotation.set(pitch, yaw, Math.random() * 3, 'YXZ');
      slot.mesh.visible = true;
      slot.mesh.material.opacity = 0.95;
      slot.life = 0.045;
      flash.position.set(x, y, z);
      flash.intensity = 60;
      flashLife = Math.max(flashLife, 0.05);
    },
    impact(x, y, z, flesh) {
      burst(x, y, z, flesh ? 7 : 5, flesh ? 1.6 : 2.4, 0.3, 1.6);
    },
    explosion(x, y, z) {
      fireball.position.set(x, y, z);
      fireball.visible = true;
      fireLife = 0.34;
      burst(x, y, z, 46, 6.5, 0.6, 5);
      flash.position.set(x, y + 0.6, z);
      flash.intensity = 900;
      flashLife = 0.3;
    },
    smoke(x, z, seconds, now) {
      const slot = smokes.find((s) => now > s.until) || smokes[0];
      slot.group.position.set(x, 0, z);
      slot.group.visible = true;
      slot.born = now;
      slot.until = now + seconds;
      slot.life = seconds;
    },
    update(dt, now) {
      let tracerDirty = false;
      for (let i = 0; i < TRACERS; i += 1) {
        if (tracerLife[i] <= 0) continue;
        tracerLife[i] -= dt;
        if (tracerLife[i] <= 0) {
          tracerPos[i * 6 + 3] = tracerPos[i * 6];
          tracerPos[i * 6 + 4] = tracerPos[i * 6 + 1];
          tracerPos[i * 6 + 5] = tracerPos[i * 6 + 2];
          tracerDirty = true;
        }
      }
      if (tracerDirty) tracerGeo.attributes.position.needsUpdate = true;
      for (let i = 0; i < SPARKS; i += 1) {
        if (sparkLife[i] <= 0) continue;
        sparkLife[i] -= dt;
        if (sparkLife[i] <= 0) {
          sparkPos[i * 3 + 1] = -50;
          continue;
        }
        sparkVel[i * 3 + 1] -= 5.5 * dt;
        sparkPos[i * 3] += sparkVel[i * 3] * dt;
        sparkPos[i * 3 + 1] += sparkVel[i * 3 + 1] * dt;
        sparkPos[i * 3 + 2] += sparkVel[i * 3 + 2] * dt;
        if (sparkPos[i * 3 + 1] < 0.02) sparkPos[i * 3 + 1] = 0.02;
      }
      sparkGeo.attributes.position.needsUpdate = true;
      if (flashLife > 0) {
        flashLife -= dt;
        if (flashLife <= 0) flash.intensity = 0;
      }
      for (const slot of muzzles) {
        if (slot.life <= 0) continue;
        slot.life -= dt;
        if (slot.life <= 0) slot.mesh.visible = false;
        else slot.mesh.material.opacity = slot.life / 0.045;
      }
      if (fireLife > 0) {
        fireLife -= dt;
        const k = 1 - Math.max(0, fireLife) / 0.34;
        fireball.scale.setScalar(0.6 + k * 4.6);
        fireball.material.opacity = 0.85 * (1 - k);
        if (fireLife <= 0) fireball.visible = false;
      }
      for (const slot of smokes) {
        if (now > slot.until) {
          slot.group.visible = false;
          continue;
        }
        const age = now - slot.born;
        const grow = Math.min(1, age / 1.4);
        const fade = Math.min(1, (slot.until - now) / 2.5);
        const scale = 0.5 + grow * 1.05;
        slot.group.scale.set(scale, scale * 0.9, scale);
        for (const puff of slot.puffs) puff.material.opacity = 0.52 * Math.min(grow + 0.2, 1) * fade;
      }
    },
  };
}
