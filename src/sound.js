// All sounds are synthesized with Web Audio, so there are no audio files.

let ctx = null;
let master = null;
let noise = null;
let muted = false;
const loops = {};

function noiseLoop(filters, gain) {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  let node = src;
  for (const [type, freq, q] of filters) {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    if (q) f.Q.value = q;
    node.connect(f);
    node = f;
  }
  const g = ctx.createGain();
  g.gain.value = 0;
  node.connect(g);
  src.start();
  return { out: node, gain: g, level: gain, filters: node };
}

function motor(freq, cutoff, amount, into) {
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = freq;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = cutoff;
  const g = ctx.createGain();
  g.gain.value = amount;
  osc.connect(lp);
  lp.connect(g);
  g.connect(into);
  osc.start();
  return osc;
}

export function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.85;
    master.connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    // Pressure washer: hiss plus a pump hum. Turbo is the same, sharper.
    loops.water = noiseLoop([['highpass', 700], ['lowpass', 7000]], 0.32);
    motor(52, 220, 0.5, loops.water.gain);
    loops.water.gain.connect(master);
    loops.turbo = noiseLoop([['highpass', 1500], ['lowpass', 9500]], 0.3);
    motor(64, 260, 0.45, loops.turbo.gain);
    loops.turbo.gain.connect(master);
    // Leaf blower: a deep rush of air over an engine drone.
    loops.blower = noiseLoop([['bandpass', 600, 0.6]], 0.3);
    motor(96, 400, 0.35, loops.blower.gain);
    loops.blower.gain.connect(master);
    // Fire hose: a big throaty gush. Hydro cannon: a roar with a deep engine.
    loops.fire = noiseLoop([['highpass', 300], ['lowpass', 3800]], 0.34);
    motor(40, 180, 0.6, loops.fire.gain);
    loops.fire.gain.connect(master);
    loops.cannon = noiseLoop([['lowpass', 2600]], 0.42);
    motor(30, 160, 0.9, loops.cannon.gain);
    loops.cannon.gain.connect(master);
    // Soap cannon: a softer, wetter hiss.
    loops.soap = noiseLoop([['bandpass', 2500, 0.8]], 0.14);
    loops.soap.gain.connect(master);
  }
  if (ctx.state === 'suspended') ctx.resume();
}

// Which looping sound is running: 'water', 'turbo', 'fire', 'cannon', 'blower', 'soap' or null.
export function setLoop(name) {
  if (!ctx) return;
  for (const [key, loop] of Object.entries(loops)) {
    loop.gain.gain.setTargetAtTime(key === name && !muted ? loop.level : 0, ctx.currentTime, 0.05);
  }
}

export function isMuted() {
  return muted;
}

export function setMuted(value) {
  muted = value;
  if (master) master.gain.setTargetAtTime(muted ? 0 : 0.85, ctx.currentTime, 0.02);
}

function tone({ type = 'sine', freq, to, dur = 0.15, gain = 0.2, delay = 0 }) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g);
  g.connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function burst({ freq = 1500, to, q = 1, dur = 0.1, gain = 0.2, delay = 0 }) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = q;
  bp.frequency.setValueAtTime(freq, t);
  if (to) bp.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(bp);
  bp.connect(g);
  g.connect(master);
  src.start(t, Math.random() * 1.5);
  src.stop(t + dur + 0.05);
}

export const sfx = {
  // A part of the job is spotless.
  ding: () => {
    tone({ type: 'triangle', freq: 1046.5, dur: 0.25, gain: 0.18 });
    tone({ type: 'triangle', freq: 1568, dur: 0.4, gain: 0.14, delay: 0.08 });
  },
  // The whole job is done.
  fanfare: () => {
    [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5].forEach((f, i) =>
      tone({ type: 'square', freq: f, dur: i === 5 ? 0.5 : 0.14, gain: 0.08, delay: i * 0.11 })
    );
  },
  cash: () => {
    tone({ type: 'square', freq: 1318, dur: 0.08, gain: 0.08 });
    tone({ type: 'square', freq: 1760, dur: 0.25, gain: 0.08, delay: 0.07 });
  },
  click: () => tone({ type: 'square', freq: 880, dur: 0.05, gain: 0.06 }),
  leaf: () => burst({ freq: 3000 + Math.random() * 2000, q: 1.2, dur: 0.06, gain: 0.08 }),
  squish: () => burst({ freq: 500 + Math.random() * 300, q: 0.7, dur: 0.12, gain: 0.2 }),
  chip: () => burst({ freq: 2200 + Math.random() * 1500, q: 2, dur: 0.03, gain: 0.05 }),
  // A clump of mud hitting the ground.
  splat: () => {
    burst({ freq: 260 + Math.random() * 120, q: 0.8, dur: 0.14, gain: 0.32 });
    tone({ freq: 140, to: 70, dur: 0.12, gain: 0.12 });
  },
  // A drop landing in a puddle.
  plink: () => tone({ freq: 900 + Math.random() * 500, to: 400, dur: 0.07, gain: 0.05 }),
  nope: () => tone({ type: 'square', freq: 180, to: 140, dur: 0.15, gain: 0.08 }),
};
