// Tiny particle puffs (dust, water drops), glints on things worth picking,
// drifting sakura petals and, at night, fireflies over fresh water.
import * as THREE from 'three';

const MAX = 600;
const PUFF = 0, PETAL = 1, SPARKLE = 2, FIREFLY = 3;

export class Particles {
  constructor(scene) {
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.alpha = new Float32Array(MAX);
    this.vel = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX);
    this.max = new Float32Array(MAX);
    this.kind = new Uint8Array(MAX);
    this.next = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 1 } },
      vertexShader: `attribute vec3 color; attribute float alpha; varying vec3 vC; varying float vA; uniform float uScale;
        void main(){ vC = color; vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_PointSize = 9.0 * uScale; }`,
      fragmentShader: `varying vec3 vC; varying float vA;
        void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); if (r > 0.5 || vA <= 0.0) discard;
          gl_FragColor = vec4(vC, vA * smoothstep(0.5, 0.2, r));
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
    scene.add(this.points);
    this.petalTimer = 0;
    this.petalSources = [];
    this.fireflyTimer = 0;
    this.fireflySources = []; // land tiles next to fresh water
    this.night = 0;
  }

  emit(x, y, z, vx, vy, vz, color, life, kind = PUFF, gain = 1) {
    const i = this.next; this.next = (this.next + 1) % MAX;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    const c = new THREE.Color(color);
    this.col.set([c.r * gain, c.g * gain, c.b * gain], i * 3); // gain > 1 glows through the night grade
    this.life[i] = this.max[i] = life;
    this.kind[i] = kind;
  }

  burst(x, y, z, { color = '#ffffff', n = 12, up = 0.9 } = {}) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, s = 0.4 + Math.random() * 0.9;
      this.emit(x, y, z, Math.cos(a) * s, up + Math.random() * up, Math.sin(a) * s, color, 0.5 + Math.random() * 0.4);
    }
  }

  /** A slow rising glint (ripe crops, wild greens). */
  sparkle(x, y, z) {
    this.emit(x, y, z, 0, 0.25, 0, '#fff4c2', 1.1, SPARKLE, 1.6);
  }

  update(dt) {
    // ambient sakura petals drifting from the blossoms
    this.petalTimer -= dt;
    if (this.petalTimer <= 0 && this.petalSources.length) {
      this.petalTimer = 0.18;
      const s = this.petalSources[Math.floor(Math.random() * this.petalSources.length)];
      this.emit(s.x + (Math.random() - 0.5) * 1.2, 1.6 + Math.random() * 0.6, s.z + (Math.random() - 0.5) * 1.2,
        0.25 + Math.random() * 0.2, -0.25, 0.1, Math.random() < 0.5 ? '#f6c3cf' : '#f9dde3', 4.5, PETAL);
    }
    // fireflies come out at dusk along the river and pond
    this.fireflyTimer -= dt;
    if (this.night > 0.35 && this.fireflyTimer <= 0 && this.fireflySources.length) {
      this.fireflyTimer = 0.5 / this.night;
      const s = this.fireflySources[Math.floor(Math.random() * this.fireflySources.length)];
      this.emit(s.x + Math.random(), 0.3 + Math.random() * 0.7, s.z + Math.random(), 0, 0, 0, '#d9f27a', 6 + Math.random() * 4, FIREFLY, 3.2);
    }
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const k = this.kind[i], j = i * 3;
      if (k === PUFF) this.vel[j + 1] -= 3.2 * dt;
      else if (k === PETAL) this.vel[j] = 0.25 + Math.sin(this.life[i] * 3 + i) * 0.35;
      else if (k === FIREFLY) {
        const t = this.life[i] + i * 1.7;
        this.vel[j] = Math.sin(t * 0.9) * 0.25; this.vel[j + 1] = Math.sin(t * 1.3) * 0.12; this.vel[j + 2] = Math.cos(t * 0.7) * 0.25;
      }
      this.pos[j] += this.vel[j] * dt;
      this.pos[j + 1] = Math.max(0.02, this.pos[j + 1] + this.vel[j + 1] * dt);
      this.pos[j + 2] += this.vel[j + 2] * dt;
      const fade = Math.min(1, this.life[i] / (this.max[i] * 0.4));
      if (k === SPARKLE) this.alpha[i] = fade * (0.55 + 0.45 * Math.sin(this.life[i] * 14));
      else if (k === FIREFLY) this.alpha[i] = fade * Math.min(1, (this.max[i] - this.life[i]) * 2) * Math.max(0, Math.sin(this.life[i] * 2.3 + i)) * this.night;
      else this.alpha[i] = fade;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.attributes.alpha.needsUpdate = true;
  }
}
