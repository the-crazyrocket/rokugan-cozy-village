// Real-world time helpers. The village runs on the player's local clock; a day
// rolls over at 5:00 so late-night sessions still count as "today".
export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;
export const DAY_START_HOUR = 5;

const pad = (n) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' of the village day containing ms (local time, day starts at 5:00). */
export function dayKey(ms) {
  const d = new Date(ms - DAY_START_HOUR * HOUR);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local hour of day as a fraction (0..24). */
export function hourOf(ms) {
  const d = new Date(ms);
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
}

export function clockText(ms) {
  return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function dateText(ms) {
  return new Date(ms - DAY_START_HOUR * HOUR).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
}

export function partOfDay(h) {
  if (h < 5) return 'Deep night';
  if (h < 7) return 'Dawn';
  if (h < 11) return 'Morning';
  if (h < 14) return 'Midday';
  if (h < 17.5) return 'Afternoon';
  if (h < 19.5) return 'Evening';
  return 'Night';
}

/** "45 s", "12 min", "3 h 20 min", "2 days" */
export function duration(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), mm = m % 60;
  if (h < 24) return mm ? `${h} h ${mm} min` : `${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? '1 day' : `${d} days`;
}

/** Stable 32-bit hash of a string (seeds the daily roll). */
export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
