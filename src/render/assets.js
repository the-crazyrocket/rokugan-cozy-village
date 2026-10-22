// Loads the painted asset manifest + textures produced by the art pipeline.
import * as THREE from 'three';

const loader = new THREE.TextureLoader();
export const assetUrl = (rel) => new URL(rel, document.baseURI).href;

function loadTex(rel, { color = true, nearest = false, repeat = false, mips = true } = {}) {
  return new Promise((resolve, reject) => {
    loader.load(assetUrl(rel), (t) => {
      t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      if (nearest) { t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; }
      else if (!mips) { t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; }
      if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
      else t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      t.anisotropy = 4;
      resolve(t);
    }, undefined, () => reject(new Error('failed to load ' + rel)));
  });
}

export async function loadPaintedAssets(onProgress = () => {}) {
  const res = await fetch(assetUrl('assets/painted/manifest.json'));
  const manifest = await res.json();
  const jobs = [];
  let done = 0;
  const track = (p) => p.then((v) => { onProgress(++done / jobs.length); return v; });
  const assets = {};
  for (const [name, a] of Object.entries(manifest.assets)) {
    assets[name] = { ...a, angles: a.angles.map((ang) => ({ ...ang })) };
    for (const ang of assets[name].angles) {
      jobs.push(track(loadTex(ang.texture, { mips: false })).then((t) => (ang.tex = t)));
      jobs.push(track(loadTex(ang.depth, { color: false, nearest: true })).then((t) => (ang.depthTex = t)));
    }
  }
  const sheets = {};
  for (const [name, s] of Object.entries(manifest.sheets)) {
    sheets[name] = { ...s };
    if (s.atlas) jobs.push(track(loadTex(s.atlas)).then((t) => (sheets[name].tex = t)));
    else {
      sheets[name].tex = {};
      for (const [cell, rel] of Object.entries(s.cells)) {
        jobs.push(track(loadTex(rel, { repeat: true })).then((t) => (sheets[name].tex[cell] = t)));
      }
    }
  }
  await Promise.all(jobs);
  return { manifest, assets, sheets };
}
