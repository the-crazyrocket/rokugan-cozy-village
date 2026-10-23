// v3: the shrine (offerings given, Fortunes awake); landmarks are placed on load
export function v2ToV3(s) {
  return { ...s, v: 3, shrine: null };
}
