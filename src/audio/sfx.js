// Action sound effects, procedural (see Sound in sound.js for the voices s.pluck / s.tone / s.noise).
import { defineSfx, getSfx } from '../core/sfxreg.js';
import { YO, hz } from './scale.js';

defineSfx('till', (s) => { s.noise(0.16, { type: 'lowpass', freq: 420, gain: 0.35 }); s.tone(95, 0.12, { slide: 0.6, gain: 0.25 }); });
// woodcutting: the axe biting in, the creak as the tree goes, the thud as it lands
defineSfx('chop', (s) => { s.noise(0.09, { freq: 900, q: 1.4, gain: 0.32 }); s.tone(170, 0.08, { slide: 0.55, gain: 0.28 }); s.noise(0.04, { when: 0.01, type: 'highpass', freq: 3500, gain: 0.05 }); });
defineSfx('timber', (s) => { s.tone(150, 0.55, { slide: 0.45, type: 'sawtooth', gain: 0.05, attack: 0.08 }); s.noise(0.5, { freq: 3000, to: 900, q: 0.8, gain: 0.06, attack: 0.1 }); });
defineSfx('thud', (s) => { s.noise(0.3, { type: 'lowpass', freq: 300, gain: 0.5 }); s.tone(62, 0.25, { slide: 0.6, gain: 0.4 }); s.noise(0.35, { when: 0.05, type: 'highpass', freq: 2800, gain: 0.06 }); });
defineSfx('plant', (s) => { s.pluck(hz(19), { gain: 0.12, bright: 0.35, rate: 1 }); s.noise(0.08, { freq: 2500, q: 2, gain: 0.05 }); });
defineSfx('water', (s) => { s.noise(0.45, { freq: 2400, to: 700, q: 1.2, gain: 0.16, attack: 0.04 }); s.noise(0.3, { when: 0.1, freq: 5000, to: 2000, q: 0.8, gain: 0.05 }); });
defineSfx('harvest', (s) => { s.pluck(hz(12), { gain: 0.24, bright: 0.7 }); s.pluck(hz(19), { when: 0.07, gain: 0.2, bright: 0.7 }); s.tone(600, 0.06, { slide: 1.8, gain: 0.07 }); });
defineSfx('forage', (s) => { s.noise(0.15, { type: 'highpass', freq: 3200, gain: 0.07 }); s.pluck(hz(17), { when: 0.04, gain: 0.18, bright: 0.6 }); });
defineSfx('cast', (s) => { s.noise(0.32, { freq: 500, to: 2600, q: 1.5, gain: 0.1, attack: 0.05 }); s.tone(420, 0.09, { when: 0.42, slide: 0.35, gain: 0.16 }); });
defineSfx('bite', (s) => { s.tone(1760, 0.09, { gain: 0.14 }); s.tone(2350, 0.12, { when: 0.07, gain: 0.12 }); });
defineSfx('catch', (s) => { s.noise(0.3, { freq: 1500, to: 500, gain: 0.14 }); [0, 2, 4].forEach((d, i) => s.pluck(hz(YO[d] + 12), { when: 0.05 + i * 0.09, gain: 0.2, bright: 0.65 })); });
defineSfx('fanfare', (s) => { [0, 1, 2, 3, 4, 5].forEach((d, i) => s.pluck(hz(YO[d % 5] + 12 * (1 + Math.floor(d / 5))), { when: i * 0.08, gain: 0.2, bright: 0.7, verb: 0.5 })); getSfx('coin')(s, 0.5); });
defineSfx('miss', (s) => { s.pluck(hz(7), { gain: 0.14, bright: 0.3 }); s.pluck(hz(5), { when: 0.16, gain: 0.12, bright: 0.3 }); });
defineSfx('coin', (s, when = 0) => { s.tone(1568, 0.25, { when, type: 'triangle', gain: 0.09, verb: 0.3 }); s.tone(2093, 0.4, { when: when + 0.07, type: 'triangle', gain: 0.08, verb: 0.3 }); });
defineSfx('claim', (s) => { [0, 2, 4].forEach((d, i) => s.pluck(hz(YO[d] + 12), { when: i * 0.07, gain: 0.18, bright: 0.65 })); getSfx('coin')(s, 0.22); });
defineSfx('ready', (s) => { s.tone(1318, 0.5, { type: 'sine', gain: 0.07, verb: 0.6 }); s.tone(1975, 0.7, { when: 0.12, type: 'sine', gain: 0.05, verb: 0.6 }); });
defineSfx('place', (s) => { s.tone(210, 0.1, { slide: 0.7, gain: 0.3 }); s.noise(0.05, { freq: 1800, q: 3, gain: 0.08 }); });
defineSfx('pickup', (s) => { s.tone(330, 0.08, { slide: 1.3, gain: 0.22 }); s.noise(0.05, { freq: 2400, q: 3, gain: 0.06 }); });
defineSfx('page', (s) => { s.noise(0.14, { freq: 1200, to: 3000, q: 0.7, gain: 0.05 }); });
