// Shared Rokugan palette. Used for UI, fallback colours on unpainted faces,
// the procedural fallback painter and the pipeline's flat colour pass.
export const PALETTE = {
  vermilion: '#c8452f',
  vermilionDark: '#93301f',
  indigo: '#2f3e66',
  indigoDeep: '#1f2945',
  moss: '#6f8a43',
  mossDark: '#4b6332',
  cream: '#efe3c4',
  paper: '#f4ead2',
  gold: '#d8a948',
  wood: '#8a5a36',
  woodDark: '#5c3a24',
  woodLight: '#b07f4f',
  straw: '#c9a45c',
  strawDark: '#9c7a3c',
  stone: '#9a9789',
  stoneDark: '#6d6b62',
  clay: '#b8693f',
  tileRoof: '#4a4e5e',
  water: '#4f86a0',
  soil: '#6b4a32',
  sakura: '#f2b8c6',
  pine: '#3f6a4a',
  skin: '#f1d0b0',
  black: '#2a2420',
};

// Material "parts" used by blockouts. Each maps to a palette colour (fallback +
// colour pass) and a grey value (for the neutral blockout render).
export const PARTS = {
  wood: { color: PALETTE.wood, grey: 0.55 },
  woodDark: { color: PALETTE.woodDark, grey: 0.38 },
  woodLight: { color: PALETTE.woodLight, grey: 0.66 },
  lacquer: { color: PALETTE.vermilion, grey: 0.5 },
  lacquerDark: { color: PALETTE.black, grey: 0.25 },
  plaster: { color: PALETTE.cream, grey: 0.86 },
  paper: { color: PALETTE.paper, grey: 0.9 },
  thatch: { color: PALETTE.straw, grey: 0.7 },
  thatchDark: { color: PALETTE.strawDark, grey: 0.55 },
  roofTile: { color: PALETTE.tileRoof, grey: 0.35 },
  stone: { color: PALETTE.stone, grey: 0.62 },
  stoneDark: { color: PALETTE.stoneDark, grey: 0.45 },
  clay: { color: PALETTE.clay, grey: 0.55 },
  indigoCloth: { color: PALETTE.indigo, grey: 0.32 },
  gold: { color: PALETTE.gold, grey: 0.75 },
  bark: { color: PALETTE.woodDark, grey: 0.4 },
  rope: { color: PALETTE.straw, grey: 0.72 },
  water: { color: PALETTE.water, grey: 0.4 },
  moss: { color: PALETTE.moss, grey: 0.5 },
  // characters
  skin: { color: PALETTE.skin, grey: 0.8 },
  hair: { color: '#2a2420', grey: 0.18 },
  cloth: { color: '#7a5236', grey: 0.45 },
  clothLight: { color: '#d9d4cc', grey: 0.85 },
};

export function hexToRgb01(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
