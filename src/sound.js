// All sounds are synthesized with Web Audio, so there are no audio files to load.

let ctx = null;
let master = null;
let noise = null;
let waterGain = null;
let muted = false;
let voice = null;

export function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.9;
    master.connect(ctx.destination);

    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    // Pressure washer: a hiss of band-limited noise over a low motor hum,
    // faded in and out together by setWater().
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 900;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 6500;
    waterGain = ctx.createGain();
    waterGain.gain.value = 0;
    src.connect(hp);
    hp.connect(lp);
    lp.connect(waterGain);
    const motor = ctx.createOscillator();
    motor.type = 'sawtooth';
    motor.frequency.value = 52;
    const hum = ctx.createBiquadFilter();
    hum.type = 'lowpass';
    hum.frequency.value = 220;
    const humGain = ctx.createGain();
    humGain.gain.value = 0.5;
    motor.connect(hum);
    hum.connect(humGain);
    humGain.connect(waterGain);
    waterGain.connect(master);
    src.start();
    motor.start();
  }
  if (ctx.state === 'suspended') ctx.resume();
}

export function isMuted() {
  return muted;
}

export function setMuted(value) {
  muted = value;
  if (master) master.gain.setTargetAtTime(muted ? 0 : 0.9, ctx.currentTime, 0.02);
  if (muted && 'speechSynthesis' in window) speechSynthesis.cancel();
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
  g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
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
  g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(bp);
  bp.connect(g);
  g.connect(master);
  src.start(t, Math.random() * 1.5);
  src.stop(t + dur + 0.05);
}

export const sfx = {
  scrub: () => burst({ freq: 1300 + Math.random() * 900, q: 0.8, dur: 0.09, gain: 0.25 }),
  pop: () => {
    const f = 520 + Math.random() * 380;
    tone({ freq: f, to: f * 2.3, dur: 0.07, gain: 0.13 });
  },
  whoosh: () => burst({ freq: 350, to: 2200, q: 0.7, dur: 0.45, gain: 0.14 }),
  jingle: () => {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      tone({ type: 'triangle', freq: f, dur: 0.4, gain: 0.2, delay: i * 0.11 })
    );
  },
  boing: () => tone({ freq: 190, to: 620, dur: 0.22, gain: 0.25 }),
  squeak: () => {
    tone({ freq: 1150, to: 1650, dur: 0.11, gain: 0.16 });
    tone({ freq: 1650, to: 950, dur: 0.14, gain: 0.16, delay: 0.1 });
  },
  honk: () => {
    for (const d of [0, 0.28]) {
      tone({ type: 'square', freq: 392, dur: 0.2, gain: 0.07, delay: d });
      tone({ type: 'square', freq: 494, dur: 0.2, gain: 0.07, delay: d });
    }
  },
  toot: () => {
    for (const d of [0, 0.32]) {
      tone({ type: 'triangle', freq: 233, dur: 0.26, gain: 0.22, delay: d });
      tone({ type: 'triangle', freq: 349, dur: 0.26, gain: 0.12, delay: d });
    }
  },
  fluff: () => burst({ freq: 500 + Math.random() * 300, q: 0.6, dur: 0.12, gain: 0.22 }),
  fanfare: () => {
    [523.25, 659.25, 783.99, 659.25, 783.99, 1046.5].forEach((f, i) =>
      tone({ type: 'triangle', freq: f, dur: i === 5 ? 0.7 : 0.3, gain: 0.2, delay: i * 0.13 })
    );
  },
};

export function setWater(on) {
  if (!waterGain) return;
  waterGain.gain.setTargetAtTime(on && !muted ? 0.24 : 0, ctx.currentTime, 0.08);
}

function pickVoice() {
  const voices = speechSynthesis.getVoices();
  voice =
    voices.find((v) => /^en/i.test(v.lang) && /samantha|karen|tessa|moira|google us english|female/i.test(v.name)) ||
    voices.find((v) => /^en/i.test(v.lang)) ||
    null;
}

if ('speechSynthesis' in window) {
  pickVoice();
  speechSynthesis.addEventListener?.('voiceschanged', pickVoice);
}

export function say(text) {
  if (muted || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  if (voice) u.voice = voice;
  u.lang = voice?.lang || 'en-US';
  u.rate = 0.95;
  u.pitch = 1.25;
  speechSynthesis.speak(u);
}
