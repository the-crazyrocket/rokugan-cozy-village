// v1 stored crop growth in ms at these stage lengths; v2 stores progress in stages.
const V1_STAGE_MS = { rice: 60_000, daikon: 90_000, tea: 120_000 };

export function v1ToV2(s) {
  return {
    ...s, v: 2, timeOffset: 0, daily: null, stats: {},
    farm: (s.farm || []).map((c) => ({ type: c.type, x: c.x, z: c.z, progress: c.growth / (V1_STAGE_MS[c.type] || 60_000), last: c.last, wet: !!c.wet })),
  };
}
