// ASHLINE — sound with no audio files: every effect is synthesized on a WebAudio graph
// (noise bursts through filters for gunfire, sines for beeps and jingles). Distant sounds
// are placed by distance and bearing from the listener, so a firefight across the yard
// sounds across the yard — and the bots' hearing uses the same ranges.

export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;
  const listener = { x: 0, z: 0, yaw: 0 };

  function unlock() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.45;
    master.connect(ctx.destination);
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  }

  // Gain and stereo pan for a sound at world (x, z); near sounds are full and centred.
  function place(x, z, base) {
    if (x === undefined) return { gain: base, pan: 0 };
    const dx = x - listener.x;
    const dz = z - listener.z;
    const dist = Math.hypot(dx, dz);
    const gain = base * Math.min(1, 9 / (9 + dist));
    const sin = Math.sin(listener.yaw);
    const cos = Math.cos(listener.yaw);
    const right = dx * cos - dz * sin;
    return { gain, pan: Math.max(-0.85, Math.min(0.85, right / Math.max(6, dist))) };
  }

  function out(gain, pan) {
    const g = ctx.createGain();
    g.gain.value = gain;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      p.connect(master);
    } else {
      g.connect(master);
    }
    return g;
  }

  function noise(at, dur, filterType, freq, q, gain, pan, sweepTo) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(freq, at);
    if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, at + dur);
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(out(1, pan));
    src.start(at);
    src.stop(at + dur + 0.05);
  }

  function tone(at, type, freq, dur, gain, pan, slideTo) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, at + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    osc.connect(g);
    g.connect(out(1, pan));
    osc.start(at);
    osc.stop(at + dur + 0.05);
  }

  function now() {
    return ctx ? ctx.currentTime : 0;
  }

  return {
    unlock,
    setListener(x, z, yaw) {
      listener.x = x;
      listener.z = z;
      listener.yaw = yaw;
    },
    // A gunshot: crack of noise over a low thump. pitch scales with the weapon class.
    shot(pitch, x, z) {
      if (!ctx) return;
      const p = place(x, z, 0.9);
      const t = now();
      noise(t, 0.11, 'lowpass', 2600 * pitch, 0.6, p.gain, p.pan, 300);
      tone(t, 'triangle', 130 * pitch, 0.09, p.gain * 0.7, p.pan, 55);
    },
    dry() {
      if (!ctx) return;
      tone(now(), 'square', 1900, 0.03, 0.12, 0);
    },
    reload() {
      if (!ctx) return;
      const t = now();
      noise(t, 0.05, 'bandpass', 900, 2, 0.25, 0);
      noise(t + 0.16, 0.05, 'bandpass', 1300, 2, 0.3, 0);
      noise(t + 0.34, 0.06, 'bandpass', 700, 2, 0.35, 0);
    },
    hit(kill, head) {
      if (!ctx) return;
      const t = now();
      tone(t, 'sine', head ? 1560 : 1180, 0.06, 0.22, 0);
      if (kill) tone(t + 0.05, 'sine', 880, 0.12, 0.25, 0);
    },
    hurt() {
      if (!ctx) return;
      tone(now(), 'sawtooth', 160, 0.12, 0.2, 0, 70);
    },
    step(running, x, z) {
      if (!ctx) return;
      const p = place(x, z, running ? 0.16 : 0.07);
      noise(now(), 0.05, 'lowpass', 500, 0.5, p.gain, p.pan);
    },
    throwIt() {
      if (!ctx) return;
      noise(now(), 0.16, 'bandpass', 600, 1, 0.12, 0, 1800);
    },
    explosion(x, z) {
      if (!ctx) return;
      const p = place(x, z, 1);
      const t = now();
      noise(t, 0.7, 'lowpass', 900, 0.4, p.gain, p.pan, 60);
      tone(t, 'sine', 90, 0.6, p.gain, p.pan, 34);
    },
    flashPop(x, z) {
      if (!ctx) return;
      const p = place(x, z, 0.7);
      const t = now();
      noise(t, 0.08, 'highpass', 3000, 0.7, p.gain, p.pan);
      tone(t, 'sine', 2400, 0.3, p.gain * 0.5, p.pan, 2300);
    },
    smokeHiss(x, z) {
      if (!ctx) return;
      const p = place(x, z, 0.3);
      noise(now(), 1.1, 'highpass', 4500, 0.5, p.gain, p.pan);
    },
    beep(final) {
      if (!ctx) return;
      tone(now(), 'square', final ? 1320 : 990, final ? 0.3 : 0.07, 0.16, 0);
    },
    interact() {
      if (!ctx) return;
      const t = now();
      tone(t, 'square', 660, 0.05, 0.12, 0);
      tone(t + 0.08, 'square', 880, 0.05, 0.12, 0);
    },
    buy() {
      if (!ctx) return;
      tone(now(), 'sine', 1240, 0.07, 0.18, 0);
    },
    denied() {
      if (!ctx) return;
      tone(now(), 'square', 220, 0.09, 0.14, 0);
    },
    roundEnd(won) {
      if (!ctx) return;
      const t = now();
      const notes = won ? [523, 659, 784] : [392, 330, 262];
      notes.forEach((f, i) => tone(t + i * 0.13, 'triangle', f, 0.22, 0.2, 0));
    },
  };
}
