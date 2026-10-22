// Tiny particle puffs (dust, water drops, sparkles) + drifting sakura petals.
import * as THREE from 'three';

const MAX = 600;

export class Particles {
  constructor(scene) {
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.alpha = new Float32Array(MAX);
    this.vel = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX);
    this.max = new Float32Array(MAX);
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
  }

  emit(x, y, z, vx, vy, vz, color, life) {
    const i = this.next; this.next = (this.next + 1) % MAX;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    const c = new THREE.Color(color);
    this.col.set([c.r, c.g, c.b], i * 3);
    this.life[i] = this.max[i] = life;
  }

  burst(x, y, z, { color = '#ffffff', n = 12, up = 0.9 } = {}) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, s = 0.4 + Math.random() * 0.9;
      this.emit(x, y, z, Math.cos(a) * s, up + Math.random() * up, Math.sin(a) * s, color, 0.5 + Math.random() * 0.4);
    }
  }

  update(dt) {
    // ambient sakura petals drifting from the blossoms
    this.petalTimer -= dt;
    if (this.petalTimer <= 0 && this.petalSources.length) {
      this.petalTimer = 0.18;
      const s = this.petalSources[Math.floor(Math.random() * this.petalSources.length)];
      this.emit(s.x + (Math.random() - 0.5) * 1.2, 1.6 + Math.random() * 0.6, s.z + (Math.random() - 0.5) * 1.2,
        0.25 + Math.random() * 0.2, -0.25, 0.1, Math.random() < 0.5 ? '#f6c3cf' : '#f9dde3', 4.5);
    }
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const petal = this.max[i] > 3;
      this.vel[i * 3 + 1] -= (petal ? 0 : 3.2) * dt;
      if (petal) this.vel[i * 3] = 0.25 + Math.sin(this.life[i] * 3 + i) * 0.35;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] = Math.max(0.02, this.pos[i * 3 + 1] + this.vel[i * 3 + 1] * dt);
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.alpha[i] = Math.min(1, this.life[i] / (this.max[i] * 0.4));
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.attributes.alpha.needsUpdate = true;
  }
}
