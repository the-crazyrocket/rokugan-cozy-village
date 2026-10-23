// A minimal ctx for scheduler and away tests: local-calendar time stub, recording bus, now() that follows sched.sim.
import { createSched } from '../../src/core/sched.js';

export const MIN = 60_000, HOUR = 3_600_000, DAY = 86_400_000;
export const local = (y, mo, d, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();

const pad = (n) => String(n).padStart(2, '0');
const SEASONS = ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter'];

export function makeTime({ festival = () => null } = {}) {
  // local calendar day, rolling at 05:00 local wall clock (not "5 h earlier", which is an hour off on DST nights)
  const dayKey = (ms) => {
    const d = new Date(ms), v = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate() - (d.getHours() < 5 ? 1 : 0)));
    return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  };
  const season = (ms) => SEASONS[Number(dayKey(ms).slice(5, 7)) - 1];
  return { dayKey, season, festival, seasonInfo: (ms) => ({ season: season(ms), year: Number(dayKey(ms).slice(0, 4)) }) };
}

export function makeCtx({ start = local(2026, 10, 23, 12), strict = true, festival } = {}) {
  const time = makeTime({ festival });
  const sched = createSched({ time });
  const clock = { t: start };
  const log = [];
  const ctx = { sched, time, strict, clock, log };
  ctx.now = () => (sched.sim ? sched.sim.at : clock.t);
  ctx.bus = { emit(name, payload = {}) { log.push({ name, payload, at: ctx.now(), away: !!sched.sim?.away }); return payload; } };
  return ctx;
}
