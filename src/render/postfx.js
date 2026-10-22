// Full-screen "paper" pass: soft ink edges from depth, brush grain, paper fibre,
// warm grade and vignette.
import * as THREE from 'three';

function paperTexture() {
  const S = 256;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, S, S);
  let seed = 7;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 2600; i++) {
    const x = r() * S, y = r() * S, a = r() * Math.PI, l = 3 + r() * 14, v = 110 + r() * 40;
    ctx.strokeStyle = `rgba(${v},${v},${v},0.35)`; ctx.lineWidth = 0.6 + r();
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      ctx.beginPath(); ctx.moveTo(x + ox, y + oy); ctx.lineTo(x + ox + Math.cos(a) * l, y + oy + Math.sin(a) * l); ctx.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

export class PostFX {
  constructor(renderer) {
    this.renderer = renderer;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    this.depthTex = new THREE.DepthTexture(size.x, size.y);
    this.target = new THREE.WebGLRenderTarget(size.x, size.y, {
      samples: 4, type: THREE.HalfFloatType, depthTexture: this.depthTex,
    });
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: this.target.texture },
        tDepth: { value: this.depthTex },
        tPaper: { value: paperTexture() },
        uRes: { value: new THREE.Vector2(size.x, size.y) },
        uEdge: { value: 1.0 },
        uTime: { value: 0 },
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */`
uniform sampler2D tColor, tDepth, tPaper; uniform vec2 uRes; uniform float uEdge, uTime;
varying vec2 vUv;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float D(vec2 uv){ return texture2D(tDepth, uv).x; }
void main(){
  vec2 px = 1.0 / uRes;
  float s = max(1.0, uRes.y / 900.0);
  vec4 col = texture2D(tColor, vUv);
  // ink edges from depth discontinuities (orthographic depth is linear)
  float d0 = D(vUv);
  float e = 0.0;
  e += abs(d0 - D(vUv + vec2(px.x, 0.0) * s));
  e += abs(d0 - D(vUv - vec2(px.x, 0.0) * s));
  e += abs(d0 - D(vUv + vec2(0.0, px.y) * s));
  e += abs(d0 - D(vUv - vec2(0.0, px.y) * s));
  float edge = smoothstep(0.0012, 0.006, e) * uEdge * step(d0, 0.9999);
  vec3 ink = vec3(0.23, 0.15, 0.11);
  col.rgb = mix(col.rgb, col.rgb * ink * 2.2, edge * 0.45);
  // paper fibre + grain
  float paper = texture2D(tPaper, vUv * uRes / 256.0 / s).r;
  float grain = hash(floor(vUv * uRes / s) + floor(uTime * 0.0)) - 0.5;
  col.rgb *= 1.0 + (paper - 0.5) * 0.16 + grain * 0.035;
  // warm grade: lift shadows toward warm brown, slight saturation
  float l = dot(col.rgb, vec3(0.299, 0.587, 0.114));
  col.rgb = mix(vec3(l), col.rgb, 1.06);
  col.rgb = col.rgb * 0.95 + vec3(0.03, 0.022, 0.012);
  // vignette
  vec2 v = vUv - 0.5;
  col.rgb *= mix(1.0, 0.8, smoothstep(0.35, 0.85, length(v * vec2(1.1, 1.0))));
  gl_FragColor = vec4(col.rgb, 1.0);
  #include <colorspace_fragment>
}`,
      depthTest: false, depthWrite: false,
    });
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    quad.frustumCulled = false;
    this.scene.add(quad);
  }

  setSize() {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.target.setSize(size.x, size.y);
    this.material.uniforms.uRes.value.set(size.x, size.y);
  }

  render(scene, camera, t) {
    this.material.uniforms.uTime.value = t;
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene, this.camera);
  }
}
