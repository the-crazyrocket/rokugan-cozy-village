// Stable fingerprint of a blockout's geometry: FNV-1a over the positions quantised to 1/1000, as 8 hex digits.
// The pipeline stores it next to the paint (manifest `geomHash`); a build whose geometry hashes differently has
// outgrown that paint, so the game shows the vertex-colour fallback until the asset is repainted.
export function geomHash(geometry) {
  const a = geometry.attributes.position.array;
  let h = 2166136261;
  for (let i = 0; i < a.length; i++) { h ^= Math.round(a[i] * 1000) | 0; h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).padStart(8, '0');
}
