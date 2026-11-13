/** GRIT runs on Indian campuses, so every time shown is IST. Storage is UTC epoch ms. */
const TZ = "Asia/Kolkata";
const IST_OFFSET = 330 * 60_000;
const DAY = 86_400_000;

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-IN", { timeZone: TZ, ...opts });
const timeF = fmt({ hour: "numeric", minute: "2-digit", hour12: true });
const dayF = fmt({ weekday: "short", day: "numeric", month: "short" });
const dayLongF = fmt({ weekday: "long", day: "numeric", month: "long" });
const dateF = fmt({ day: "numeric", month: "short", year: "numeric" });
const weekdayF = fmt({ weekday: "short" });
const dayNumF = fmt({ day: "numeric" });
const monthF = fmt({ month: "short" });

export const fmtTime = (ms: number) => timeF.format(ms).replace("am", "AM").replace("pm", "PM");
export const fmtDay = (ms: number) => dayF.format(ms);
export const fmtDayLong = (ms: number) => dayLongF.format(ms);
export const fmtDate = (ms: number) => dateF.format(ms);
export const fmtWeekday = (ms: number) => weekdayF.format(ms);
export const fmtDayNum = (ms: number) => dayNumF.format(ms);
export const fmtMonth = (ms: number) => monthF.format(ms);
export const fmtRange = (start: number, end: number) => `${fmtTime(start)} – ${fmtTime(end)}`;
export const fmtDayTime = (ms: number) => `${fmtDay(ms)}, ${fmtTime(ms)}`;

/** "2026-11-17" for the IST calendar day containing ms. */
export const dayKey = (ms: number) => new Date(ms + IST_OFFSET).toISOString().slice(0, 10);
/** UTC ms of 00:00 IST for the day containing ms. */
export const startOfDay = (ms: number) => Math.floor((ms + IST_OFFSET) / DAY) * DAY - IST_OFFSET;
export const dayKeyToStart = (key: string) => Date.parse(`${key}T00:00:00+05:30`);
export const isDayKey = (key: string) => /^\d{4}-\d{2}-\d{2}$/.test(key) && !Number.isNaN(dayKeyToStart(key));
/** Hour of day in IST as a decimal, e.g. 9.5 for 09:30. */
export const istHour = (ms: number) => ((ms + IST_OFFSET) % DAY) / 3_600_000;

export function relDay(ms: number, now: number): string {
  const diff = Math.round((startOfDay(ms) - startOfDay(now)) / DAY);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return fmtDay(ms);
}

/** "3 days", "5 hours", "20 minutes" — absolute size of a gap, rounded down sensibly. */
export function fmtGap(ms: number): string {
  const abs = Math.abs(ms);
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  if (abs >= DAY) return plural(Math.floor(abs / DAY), "day");
  if (abs >= 3_600_000) return plural(Math.floor(abs / 3_600_000), "hour");
  return plural(Math.max(1, Math.floor(abs / 60_000)), "minute");
}

export const daysBetween = (from: number, to: number) => Math.floor((to - from) / DAY);
