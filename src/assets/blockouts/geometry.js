import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PARTS } from '../palette.js';
import { BLOCKOUTS } from './registry.js';

const D = Math.PI / 180;

function triGeometry(tris, center) {
  // tris: array of [a,b,c] Vector3; flips winding so normals point away from center
  const pos = [];
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), n = new THREE.Vector3(), c = new THREE.Vector3();
  for (const [a, b, d] of tris) {
    ab.subVectors(b, a); ac.subVectors(d, a); n.crossVectors(ab, ac);
    c.copy(a).add(b).add(d).divideScalar(3).sub(center);
    if (n.dot(c) < 0) pos.push(a.x, a.y, a.z, d.x, d.y, d.z, b.x, b.y, b.z);
    else pos.push(a.x, a.y, a.z, b.x, b.y, b.z, d.x, d.y, d.z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

function quad(a, b, c, d) { return [[a, b, c], [a, c, d]]; }
const V = (x, y, z) => new THREE.Vector3(x, y, z);

function prismGeometry(w, h, d) {
  const x0 = -w / 2, x1 = w / 2;
  const A0 = V(x0, 0, -d / 2), B0 = V(x0, 0, d / 2), C0 = V(x0, h, 0);
  const A1 = V(x1, 0, -d / 2), B1 = V(x1, 0, d / 2), C1 = V(x1, h, 0);
  return triGeometry([
    [A0, B0, C0], [A1, B1, C1],
    ...quad(B0, B1, C1, C0), ...quad(A0, A1, C1, C0), ...quad(A0, A1, B1, B0),
  ], V(0, h / 3, 0));
}

function hipGeometry(w, d, h, ridge) {
  const a = V(-w / 2, 0, -d / 2), b = V(w / 2, 0, -d / 2), c = V(w / 2, 0, d / 2), e = V(-w / 2, 0, d / 2);
  const r0 = V(-ridge / 2, h, 0), r1 = V(ridge / 2, h, 0);
  return triGeometry([
    ...quad(e, c, r1, r0), ...quad(a, b, r1, r0), [b, c, r1], [a, e, r0], ...quad(a, b, c, e),
  ], V(0, h / 3, 0));
}

function primitiveGeometry(p) {
  let g;
  switch (p.shape) {
    case 'box': g = new THREE.BoxGeometry(...p.size); break;
    case 'cyl': g = new THREE.CylinderGeometry(p.rt, p.rb, p.h, p.seg || 12); break;
    case 'cone': g = new THREE.ConeGeometry(p.r, p.h, p.seg || 12); break;
    case 'sphere': g = new THREE.SphereGeometry(p.r, p.seg || 12, Math.max(6, Math.round((p.seg || 12) * 0.66))); break;
    case 'prism': g = prismGeometry(p.w, p.h, p.d); break;
    case 'hip': g = hipGeometry(p.w, p.d, p.h, p.ridge); break;
    default: throw new Error('unknown shape ' + p.shape);
  }
  if (g.index) g = g.toNonIndexed();
  g.deleteAttribute('uv');
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(p.rot || [0, 0, 0]).map((v) => v * D)));
  m.compose(V(...p.pos), q, V(...(p.scale || [1, 1, 1])));
  g.applyMatrix4(m);
  return g;
}

/**
 * Merge a blockout into a single BufferGeometry (asset space).
 * mode: 'palette' -> vertex colour = part colour, 'grey' -> neutral grey value.
 */
export function buildBlockoutGeometry(name, { mode = 'palette' } = {}) {
  const def = BLOCKOUTS[name];
  if (!def) throw new Error('unknown blockout ' + name);
  return buildPartsGeometry(def.parts, { mode });
}

/** Merge some parts of a blockout (a character's one bone, say) into a BufferGeometry, in asset space. */
export function buildPartsGeometry(parts, { mode = 'palette' } = {}) {
  const geos = parts.map((p) => {
    const g = primitiveGeometry(p);
    const part = PARTS[p.part] || PARTS.wood;
    const c = mode === 'grey'
      ? new THREE.Color().setRGB(part.grey, part.grey, part.grey, THREE.SRGBColorSpace)
      : new THREE.Color(part.color); // converted to linear working space
    const rgb = [c.r, c.g, c.b];
    const col = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < col.length; i += 3) { col[i] = rgb[0]; col[i + 1] = rgb[1]; col[i + 2] = rgb[2]; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  });
  const merged = mergeGeometries(geos, false);
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}
