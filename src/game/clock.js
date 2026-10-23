// Real-world time helpers. The village runs on the player's local clock; a day
// rolls over at 5:00 so late-night sessions still count as "today".
import { HOUR, DAY_START_HOUR } from '../core/time.js';

export { MIN, HOUR, DAY, DAY_START_HOUR, dayKey, hourOf, duration } from '../core/time.js';
export { hashString } from '../core/rng.js';

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
