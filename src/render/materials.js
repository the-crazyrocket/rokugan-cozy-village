// Materials: camera-projection mapping of the painted renders onto blockouts,
// plus a brushy Lambert for procedural (unpainted) things like characters.
import * as THREE from 'three';

const NOISE_GLSL = /* glsl */`
float rcvHash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float rcvNoise(vec3 x){
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(rcvHash(i), rcvHash(i + vec3(1,0,0)), f.x), mix(rcvHash(i + vec3(0,1,0)), rcvHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(rcvHash(i + vec3(0,0,1)), rcvHash(i + vec3(1,0,1)), f.x), mix(rcvHash(i + vec3(0,1,1)), rcvHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
// anisotropic "brush stroke" noise
float rcvBrush(vec3 p){ return rcvNoise(vec3(p.x * 9.0, p.y * 2.5, p.z * 9.0)) * 0.6 + rcvNoise(p * 23.0) * 0.4; }
`;

// How much scene lighting affects painted surfaces (paint already has light baked in).
export const paintUniforms = {
  uLightMix: { value: 0.55 },
  uPaintGain: { value: 1.0 },
};

/**
 * Projection-mapped material for one painted asset.
 * Uses asset-space position (geometry is merged in asset space) so meshes can be
 * translated/rotated freely. Each paint camera contributes per fragment with
 * weight smoothstep(dot(normal, -viewDir)) * depth-visibility; uncovered faces
 * fall back to the palette vertex colour.
 */
export function makePaintedMaterial(asset) {
  const angles = asset.angles.slice(0, 2);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const uniforms = { ...paintUniforms };
  angles.forEach((a, i) => {
    const f = a.camera.frustum;
    uniforms[`uPaint${i}`] = { value: a.tex };
    uniforms[`uDepth${i}`] = { value: a.depthTex };
    uniforms[`uVP${i}`] = { value: new THREE.Matrix4().fromArray(a.camera.viewProjectionMatrix) };
    uniforms[`uDir${i}`] = { value: new THREE.Vector3().fromArray(a.camera.viewDir) };
    uniforms[`uRange${i}`] = { value: f.far - f.near };
  });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vAssetPos;\nvarying vec3 vAssetNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAssetPos = position;\nvAssetNormal = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vAssetPos; varying vec3 vAssetNormal;
uniform sampler2D uPaint0, uPaint1, uDepth0, uDepth1;
uniform mat4 uVP0, uVP1; uniform vec3 uDir0, uDir1; uniform float uRange0, uRange1;
uniform float uLightMix, uPaintGain;
vec3 rcvPainted; float rcvCover;
${NOISE_GLSL}
vec4 paintSample(sampler2D tex, sampler2D dep, mat4 vp, vec3 dir, float range, vec3 n){
  vec4 clip = vp * vec4(vAssetPos, 1.0);
  vec3 ndc = clip.xyz / clip.w;
  vec2 uv = ndc.xy * 0.5 + 0.5;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec4(0.0);
  float w = smoothstep(-0.02, 0.4, dot(n, -dir));
  if (w <= 0.0) return vec4(0.0);
  vec4 dd = texture2D(dep, uv);
  float stored = dd.b < 0.5 ? 1.0 : dd.r + dd.g / 255.0;
  float diff = ((ndc.z * 0.5 + 0.5) - stored) * range; // world units behind the painted surface
  w *= 1.0 - smoothstep(0.03, 0.09, diff);
  return vec4(texture2D(tex, uv).rgb * w, w);
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec3 n = normalize(vAssetNormal);
  vec4 acc = paintSample(uPaint0, uDepth0, uVP0, uDir0, uRange0, n) + paintSample(uPaint1, uDepth1, uVP1, uDir1, uRange1, n);
  float b = rcvBrush(vAssetPos * 1.3);
  vec3 fallback = diffuseColor.rgb * (0.9 + 0.2 * b);
  rcvCover = clamp(acc.w * 2.0, 0.0, 1.0);
  rcvPainted = acc.w > 1e-4 ? acc.rgb / acc.w * uPaintGain : fallback;
  diffuseColor.rgb = mix(fallback, rcvPainted, rcvCover);
}`)
      .replace('#include <opaque_fragment>', `
// painted texels already contain lighting: blend lit and unlit result
outgoingLight = mix(diffuseColor.rgb * 1.02, outgoingLight, uLightMix);
#include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => 'painted-projection-v1';
  return mat;
}

/** Lambert with subtle brush-stroke noise; used for procedural meshes (characters, bobber...). */
export function makeBrushMaterial(color, { strength = 0.14, scale = 2.0, ...opts } = {}) {
  const mat = new THREE.MeshLambertMaterial({ color, ...opts });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBrushPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBrushPos = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vBrushPos;\n${NOISE_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\ndiffuseColor.rgb *= ${(1 - strength / 2).toFixed(3)} + ${strength.toFixed(3)} * rcvBrush(vBrushPos * ${scale.toFixed(2)});`);
  };
  mat.customProgramCacheKey = () => `brush-${strength}-${scale}`;
  return mat;
}

export { NOISE_GLSL };
