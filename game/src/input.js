// ASHLINE — keyboard and mouse: a held-keys set, a queue of one-shot key taps (buy menu,
// weapon slots, grenades), accumulated mouse look, and pointer lock on the canvas.

export function createInput(canvas, onLockChange) {
  const keys = new Set();
  const taps = [];
  let lookX = 0;
  let lookY = 0;
  let firing = false;
  let aiming = false;
  let locked = false;

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Tab') e.preventDefault();
    if (!e.repeat) taps.push(e.code);
    keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => {
    keys.clear();
    firing = false;
    aiming = false;
  });
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
    if (!locked) {
      firing = false;
      aiming = false;
    }
    onLockChange(locked);
  });
  canvas.addEventListener('mousedown', (e) => {
    if (!locked) return;
    if (e.button === 0) firing = true;
    if (e.button === 2) aiming = true;
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) firing = false;
    if (e.button === 2) aiming = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('mousemove', (e) => {
    if (!locked) return;
    lookX += e.movementX || 0;
    lookY += e.movementY || 0;
  });

  return {
    keys,
    get firing() { return firing; },
    get aiming() { return aiming; },
    get locked() { return locked; },
    takeLook() {
      const out = { x: lookX, y: lookY };
      lookX = 0;
      lookY = 0;
      return out;
    },
    takeTaps() {
      return taps.splice(0, taps.length);
    },
    requestLock() {
      canvas.requestPointerLock();
    },
  };
}
