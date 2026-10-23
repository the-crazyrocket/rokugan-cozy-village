// Instanced camera-facing billboards (grass, flowers, crops, bamboo, canopies)
// sampling the painted sprite atlases, with a gentle vertex-shader sway.
import * as THREE from 'three';

export class BillboardLayer {
  constructor(sheet, { capacity = 4000, name = 'billboards' } = {}) {
    this.sheet = sheet;
    this.capacity = capacity;
    const base = new THREE.PlaneGeometry(1, 1);
    base.translate(0, 0.5, 0);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.setAttribute('position', base.attributes.position);
    g.setAttribute('uv', base.attributes.uv);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this.aSize = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 2), 2);
    this.aUV = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    this.aParam = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4); // sway, phase, shade, lean
    for (const a of [this.aPos, this.aSize, this.aUV, this.aParam]) a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPos', this.aPos);
    g.setAttribute('iSize', this.aSize);
    g.setAttribute('iUV', this.aUV);
    g.setAttribute('iParam', this.aParam);
    g.instanceCount = 0;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(32, 0, 32), 80);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: sheet.tex },
        uTime: { value: 0 },
        uLight: { value: new THREE.Color(1, 1, 1) },
      },
      vertexShader: /* glsl */`
attribute vec3 iPos; attribute vec2 iSize; attribute vec4 iUV; attribute vec4 iParam;
uniform float uTime;
varying vec2 vUv; varying float vShade; varying float vH;
void main(){
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 fwd = vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
  float h = position.y;
  float sway = iParam.x * h * h * (sin(uTime * 1.7 + iParam.y + iPos.x * 0.6) * 0.7 + sin(uTime * 2.9 + iParam.y * 1.7) * 0.3);
  vec3 wp = iPos + right * (position.x * iSize.x + sway) + up * (h * iSize.y);
  // push slightly toward the camera so sprites standing on a tile don't clip the ground
  wp += fwd * (0.18 * iSize.y * h + iParam.w);
  vUv = vec2(mix(iUV.x, iUV.z, uv.x), mix(iUV.y, iUV.w, uv.y));
  vShade = iParam.z; vH = h;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`,
      fragmentShader: /* glsl */`
uniform sampler2D uMap; uniform vec3 uLight;
varying vec2 vUv; varying float vShade; varying float vH;
void main(){
  vec4 c = texture2D(uMap, vUv);
  if (c.a < 0.5) discard;
  float ao = mix(0.72, 1.0, smoothstep(0.0, 0.45, vH));
  gl_FragColor = vec4(c.rgb * uLight * ao * vShade, 1.0);
  #include <colorspace_fragment>
}`,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.name = name;
    this.geometry = g;
  }

  /** items: [{x,y,z, sprite, height, sway?, phase?, shade?, lean?}] */
  set(items) {
    const n = Math.min(items.length, this.capacity);
    const cells = this.sheet.cells;
    for (let i = 0; i < n; i++) {
      const it = items[i];
      const c = cells[it.sprite];
      if (!c) continue;
      const h = it.height;
      this.aPos.setXYZ(i, it.x, it.y || 0, it.z);
      this.aSize.setXY(i, h * c.aspect * (it.flip ? -1 : 1), h);
      this.aUV.setXYZW(i, c.uv[0], c.uv[1], c.uv[2], c.uv[3]);
      this.aParam.setXYZW(i, it.sway ?? 0.06, it.phase ?? (i * 1.37) % 6.28, it.shade ?? 1, it.lean ?? 0);
    }
    for (const a of [this.aPos, this.aSize, this.aUV, this.aParam]) a.needsUpdate = true;
    this.geometry.instanceCount = n;
  }

  update(t) { this.material.uniforms.uTime.value = t; }
}

/** Soft round contact shadows (instanced flat discs). */
export class BlobShadows {
  constructor(capacity = 400) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const ctx = c.getContext('2d');
    const gr = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(40,30,25,0.55)'); gr.addColorStop(0.6, 'rgba(40,30,25,0.25)'); gr.addColorStop(1, 'rgba(40,30,25,0)');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    const g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2);
    this.mesh = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }), capacity);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.capacity = capacity;
  }
  set(items) {
    const m = new THREE.Matrix4();
    const n = Math.min(items.length, this.capacity);
    for (let i = 0; i < n; i++) {
      const it = items[i];
      m.makeScale(it.r * 2, 1, it.r * 2 * (it.squash || 1)).setPosition(it.x, (it.y || 0) + 0.012, it.z);
      this.mesh.setMatrixAt(i, m);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
