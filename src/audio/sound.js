// Procedural sound, no audio files: koto-like plucks (Karplus-Strong), a
// breathy shakuhachi-ish flute at dusk, ambience (waves; birds by day,
// crickets at night) and action effects. Music drifts between the bright yo
// scale by day and the softer in scale at night. The AudioContext starts on
// the first user gesture (mobile autoplay rules) and pauses while hidden.
import { YO, IN, hz } from './scale.js';
import { getSfx } from '../core/sfxreg.js';
import './sfx.js';

const SETTINGS_KEY = 'rokugan-cozy-village/settings';
const rand = (a, b) => a + Math.random() * (b - a);

function loadSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {}; } catch { return {}; }
}

export class Sound {
  constructor() {
    this.settings = { music: true, sfx: true, ...loadSettings() };
    this.ctx = null;
    this.night = 0;
    this.buffers = new Map();
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend?.(); else this.ctx.resume?.();
    });
  }

  /** Create / resume the audio graph. Call from a user gesture. */
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended' && !document.hidden) this.ctx.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { this.ctx = new AC({ latencyHint: 'interactive' }); } catch { return; }
    const c = this.ctx;
    const comp = c.createDynamicsCompressor(); // keeps peaks polite on phone speakers
    comp.threshold.value = -16; comp.ratio.value = 3;
    comp.connect(c.destination);
    this.master = c.createGain(); this.master.gain.value = 0.9; this.master.connect(comp);
    this.reverb = c.createConvolver(); this.reverb.buffer = this.impulse(2.4);
    const wet = c.createGain(); wet.gain.value = 0.32; this.reverb.connect(wet).connect(this.master);
    this.musicBus = c.createGain(); this.musicBus.connect(this.master);
    this.ambBus = c.createGain(); this.ambBus.connect(this.master);
    this.sfxBus = c.createGain(); this.sfxBus.connect(this.master);
    this.applySettings();
    this.startWaves();
    const t = c.currentTime;
    this.nextPhrase = t + 1.5; this.nextBird = t + 3; this.nextCricket = t + 1; this.nextDrone = t + 4;
  }

  applySettings() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.musicBus.gain.setTargetAtTime(this.settings.music ? 0.6 : 0, t, 0.3);
    this.ambBus.gain.setTargetAtTime(this.settings.music ? 0.55 : 0, t, 0.3);
    this.sfxBus.gain.setTargetAtTime(this.settings.sfx ? 0.75 : 0, t, 0.05);
  }

  set(key, on) {
    this.settings[key] = on;
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch { /* ignore */ }
    this.applySettings();
  }

  // ------------------------------------------------------------------ building blocks
  impulse(sec) {
    const c = this.ctx, n = Math.floor(c.sampleRate * sec), b = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 3;
    }
    return b;
  }

  noiseBuffer(sec = 2, brown = false) {
    const key = `noise${sec}${brown}`;
    if (this.buffers.has(key)) return this.buffers.get(key);
    const c = this.ctx, n = Math.floor(c.sampleRate * sec), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
    }
    this.buffers.set(key, b);
    return b;
  }

  /** Karplus-Strong plucked string. The buffer's sample rate is picked so the delay line is exact. */
  pluckBuffer(freq, bright = 0.5, sec = 2.4) {
    bright = bright >= 0.6 ? 0.7 : bright >= 0.4 ? 0.5 : 0.3; // few variants -> few cached buffers
    const key = `ks${freq.toFixed(2)}|${bright}`;
    if (this.buffers.has(key)) return this.buffers.get(key);
    const N = Math.max(8, Math.round(32000 / freq)), sr = Math.min(96000, Math.max(16000, freq * N));
    const n = Math.floor(sr * sec), b = this.ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
    const ring = new Float32Array(N);
    let lp = 0;
    for (let i = 0; i < N; i++) { lp += (Math.random() * 2 - 1 - lp) * bright; ring[i] = lp; }
    const loss = 0.5 ** (1 / (freq * 0.9)); // amplitude halves every ~0.9 s at any pitch
    let idx = 0, peak = 1e-6;
    for (let i = 0; i < n; i++) {
      const a = ring[idx], nx = ring[(idx + 1) % N];
      d[i] = a; peak = Math.max(peak, Math.abs(a));
      ring[idx] = (a + nx) * 0.5 * loss;
      idx = (idx + 1) % N;
    }
    for (let i = 0; i < n; i++) d[i] = (d[i] / peak) * Math.min(1, (n - i) / (sr * 0.3));
    this.buffers.set(key, b);
    return b;
  }

  out(bus, pan = 0, verb = 0) {
    const c = this.ctx, g = c.createGain();
    let node = g;
    if (pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; g.connect(p); node = p; }
    node.connect(bus);
    if (verb) { const s = c.createGain(); s.gain.value = verb; node.connect(s).connect(this.reverb); }
    return g;
  }

  pluck(freq, { when = 0, gain = 0.3, bright = 0.5, pan = 0, bus = this.sfxBus, verb = 0.3, rate = 1 } = {}) {
    const c = this.ctx, t = c.currentTime + when;
    const src = c.createBufferSource();
    src.buffer = this.pluckBuffer(freq, bright);
    src.playbackRate.value = rate;
    const g = this.out(bus, pan, verb);
    g.gain.value = gain;
    src.connect(g);
    src.start(t);
    src.stop(t + 2.4);
  }

  tone(freq, dur, { when = 0, type = 'sine', gain = 0.2, attack = 0.005, slide = 0, bus = this.sfxBus, pan = 0, verb = 0.1 } = {}) {
    const c = this.ctx, t = c.currentTime + when;
    gain = Math.max(1e-3, gain);
    const o = c.createOscillator(), g = this.out(bus, pan, verb);
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); o.start(t); o.stop(t + dur + 0.05);
  }

  noise(dur, { when = 0, type = 'bandpass', freq = 1000, to = 0, q = 1, gain = 0.2, attack = 0.01, bus = this.sfxBus, pan = 0, verb = 0.1 } = {}) {
    const c = this.ctx, t = c.currentTime + when;
    gain = Math.max(1e-3, gain);
    const src = c.createBufferSource(); src.buffer = this.noiseBuffer();
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = this.out(bus, pan, verb);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g);
    src.start(t, Math.random()); src.stop(t + dur + 0.05);
  }

  /** Breathy flute tone with a little scoop into the note and late vibrato. */
  flute(freq, dur, { when = 0, gain = 0.09 } = {}) {
    const c = this.ctx, t = c.currentTime + when;
    const o = c.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(freq * 0.97, t);
    o.frequency.exponentialRampToValueAtTime(freq, t + 0.3);
    const lfo = c.createOscillator(), depth = c.createGain();
    lfo.frequency.value = 4.8; depth.gain.setValueAtTime(0, t); depth.gain.linearRampToValueAtTime(freq * 0.012, t + dur * 0.6);
    lfo.connect(depth).connect(o.frequency);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = freq * 3;
    const g = this.out(this.musicBus, rand(-0.3, 0.3), 0.55);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.45);
    g.gain.setValueAtTime(gain, t + dur - 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp).connect(g);
    o.start(t); lfo.start(t); o.stop(t + dur + 0.1); lfo.stop(t + dur + 0.1);
    this.noise(dur, { when, freq: freq * 2, q: 3, gain: gain * 0.35, attack: 0.3, bus: this.musicBus, verb: 0.5 });
  }

  startWaves() {
    const c = this.ctx;
    const src = c.createBufferSource(); src.buffer = this.noiseBuffer(6, true); src.loop = true;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520;
    const g = c.createGain(); g.gain.value = 0.22;
    const lfo = c.createOscillator(), depth = c.createGain();
    lfo.frequency.value = 0.085; depth.gain.value = 0.12;
    lfo.connect(depth).connect(g.gain);
    src.connect(lp).connect(g).connect(this.ambBus);
    src.start(); lfo.start();
  }

  // ------------------------------------------------------------------ music + ambience scheduler
  /** Call every frame; schedules a little ahead of the audio clock. */
  update(night = 0) {
    this.night = night;
    const c = this.ctx;
    if (!c || c.state !== 'running') return;
    const t = c.currentTime;
    if (t > this.nextPhrase) this.phrase();
    if (t > this.nextDrone) {
      this.pluck(hz(-12), { bus: this.musicBus, gain: 0.16, bright: 0.25, verb: 0.6 });
      this.nextDrone = t + rand(16, 28);
    }
    if (night < 0.6 && t > this.nextBird) { this.birds(1 - night); this.nextBird = t + rand(5, 14); }
    if (night > 0.35 && t > this.nextCricket) { this.crickets(night); this.nextCricket = t + rand(0.9, 2.6); }
  }

  phrase() {
    const scale = this.night > 0.5 ? IN : YO;
    const at = (deg) => hz(scale[((deg % 5) + 5) % 5] + 12 * Math.floor(deg / 5));
    const len = 3 + Math.floor(Math.random() * 4);
    let deg = 3 + Math.floor(Math.random() * 4), when = 0;
    for (let i = 0; i < len; i++) {
      deg = Math.max(0, Math.min(9, deg + [-2, -1, -1, 1, 1, 2, 0][Math.floor(Math.random() * 7)]));
      if (i === len - 1) deg = Math.random() < 0.6 ? 5 : 3; // settle on the octave or the fourth
      const v = rand(0.16, 0.28);
      this.pluck(at(deg), { when, bus: this.musicBus, gain: v, bright: 0.55, pan: rand(-0.35, 0.35), verb: 0.45 });
      if (Math.random() < 0.18) this.pluck(at(deg - 5), { when, bus: this.musicBus, gain: v * 0.6, bright: 0.4, verb: 0.45 });
      when += [0.38, 0.5, 0.5, 0.75, 1.0][Math.floor(Math.random() * 5)] * (this.night > 0.5 ? 1.3 : 1);
    }
    if (this.night > 0.25 && Math.random() < 0.4) this.flute(at(Math.random() < 0.5 ? 3 : 5) / 2, rand(2.5, 4), { when: when + 0.6 });
    this.nextPhrase = this.ctx.currentTime + when + rand(5, 12) * (this.night > 0.5 ? 1.4 : 1);
  }

  birds(level) {
    const n = 2 + Math.floor(Math.random() * 4), base = rand(2600, 3800), pan = rand(-0.8, 0.8);
    for (let i = 0; i < n; i++) {
      this.tone(base * rand(0.9, 1.15), rand(0.06, 0.12), { when: i * rand(0.1, 0.16), slide: rand(0.7, 1.4), gain: 0.035 * level, bus: this.ambBus, pan, verb: 0.3 });
    }
  }

  crickets(level) {
    const f = rand(4200, 4800), pan = rand(-0.9, 0.9);
    for (let i = 0; i < 5 + Math.floor(Math.random() * 5); i++) {
      this.tone(f, 0.035, { when: i * 0.055, gain: 0.018 * level, attack: 0.004, bus: this.ambBus, pan, verb: 0.15 });
    }
  }

  // ------------------------------------------------------------------ effects
  play(name) {
    if (!this.ctx || this.ctx.state !== 'running' || !this.settings.sfx) return;
    const fx = getSfx(name);
    if (fx) fx(this);
  }
}
