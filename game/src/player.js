// ASHLINE — the player's body: one combatant record (the same shape the bots use, so
// combat treats everyone alike) plus the movement controller — acceleration and friction
// on the ground, a short hop, crouching, and collision sliding against the map's boxes.
// Standing still is a skill here: weapons.js reads speedRatio() for its spread model.
import * as THREE from 'three';
import { PLAYER } from './config.js';
import { moveBody } from './combat.js';

export function createPlayerCombatant() {
  return {
    id: 0,
    name: 'You',
    isPlayer: true,
    team: 'jackal',
    alive: true,
    hp: 100,
    armor: false,
    pos: new THREE.Vector3(-28, 0, 21),
    vel: new THREE.Vector3(),
    yaw: Math.PI * 0.75, // facing into the yard from the south-west spawn
    pitch: 0,
    punch: 0, // recoil view-kick, recovered in step()
    crouch: false,
    height: PLAYER.heightStand,
    eye: PLAYER.eyeStand,
    radius: PLAYER.radius,
    speedNow: 0,
    grounded: true,
    money: 0,
    gun: null, // current weapon runtime, weapons.js owns its shape
    guns: { primary: null, sidearm: null },
    grenades: { frag: 0, flash: 0, smoke: 0 },
    grenadeSel: 'frag',
    blindUntil: 0,
    lastHurtAt: -9,
    diedAt: 0,
    stride: 0, // distance accumulator for footstep sounds
  };
}

export function eyeOf(c) {
  return { x: c.pos.x, y: c.pos.y + c.eye, z: c.pos.z };
}

export function speedRatio(c) {
  return Math.min(1, Math.hypot(c.vel.x, c.vel.z) / PLAYER.speed);
}

// One fixed step of player movement. input is the input.js state; audio may be null.
export function stepPlayer(state, c, input, audio, dt) {
  const keys = input.keys;
  c.crouch = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
  const targetHeight = c.crouch ? PLAYER.heightCrouch : PLAYER.heightStand;
  const targetEye = c.crouch ? PLAYER.eyeCrouch : PLAYER.eyeStand;
  c.height += (targetHeight - c.height) * Math.min(1, dt * 11);
  c.eye += (targetEye - c.eye) * Math.min(1, dt * 11);

  const walking = keys.has('ShiftLeft') || keys.has('ShiftRight');
  const maxSpeed = c.crouch ? PLAYER.crouchSpeed : walking ? PLAYER.walkSpeed : PLAYER.speed;
  const sin = Math.sin(c.yaw);
  const cos = Math.cos(c.yaw);
  let wx = 0;
  let wz = 0;
  if (keys.has('KeyW')) { wx -= sin; wz -= cos; }
  if (keys.has('KeyS')) { wx += sin; wz += cos; }
  if (keys.has('KeyA')) { wx -= cos; wz += sin; }
  if (keys.has('KeyD')) { wx += cos; wz -= sin; }
  const wishLen = Math.hypot(wx, wz);
  if (wishLen > 0) {
    wx /= wishLen;
    wz /= wishLen;
  }
  const accel = c.grounded ? PLAYER.accel : PLAYER.airAccel;
  c.vel.x += wx * accel * dt;
  c.vel.z += wz * accel * dt;
  if (c.grounded && wishLen === 0) {
    const drag = Math.max(0, 1 - 11 * dt); // firm stop: stopping to aim pays
    c.vel.x *= drag;
    c.vel.z *= drag;
  }
  const planar = Math.hypot(c.vel.x, c.vel.z);
  if (planar > maxSpeed) {
    c.vel.x = (c.vel.x / planar) * maxSpeed;
    c.vel.z = (c.vel.z / planar) * maxSpeed;
  }
  if (keys.has('Space') && c.grounded) {
    c.vel.y = PLAYER.jumpSpeed;
    c.grounded = false;
  }
  c.vel.y -= PLAYER.gravity * dt;
  c.pos.y += c.vel.y * dt;
  if (c.pos.y <= 0) {
    c.pos.y = 0;
    c.vel.y = 0;
    c.grounded = true;
  }
  moveBody(c.pos, c.radius, c.vel.x * dt, c.vel.z * dt);
  c.speedNow = Math.hypot(c.vel.x, c.vel.z);

  // Footsteps: quieter walking, silent crouching; runners announce themselves to bot ears.
  if (c.grounded && c.speedNow > 0.6) {
    c.stride += c.speedNow * dt;
    const strideLen = c.crouch ? 2.6 : 2.1;
    if (c.stride > strideLen) {
      c.stride = 0;
      const running = !walking && !c.crouch;
      if (audio) audio.step(running);
      if (running) state.noises.push({ x: c.pos.x, z: c.pos.z, radius: 9, team: c.team, at: state.time });
    }
  }
  c.punch *= Math.max(0, 1 - 9 * dt); // recoil recovery
}
