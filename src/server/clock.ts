/**
 * The one place the app asks "what time is it?".
 *
 * Every journey state is derived from the clock rather than stored, so the prototype
 * can move time forward and watch interviews start, finish and go overdue without
 * touching any data. The offset lives in a cookie and applies to every page and
 * every server action in this browser, so all personas see the same moment.
 *
 * Demo only: production returns Date.now() and the cookie is ignored.
 */
import { cookies } from "next/headers";
import { cache } from "react";
import { MS, POLICY } from "@/domain/policy";

export const CLOCK_COOKIE = "grit_clock_offset";
export const MAX_CLOCK_OFFSET = POLICY.demoClockMaxDays * MS.DAY;

export const clampOffset = (ms: number) => Math.min(MAX_CLOCK_OFFSET, Math.max(0, Math.round(ms)));

/** Offset in ms ahead of real time. Cached per request so one render sees one instant. */
export const getClockOffset = cache(async (): Promise<number> => {
  const raw = Number((await cookies()).get(CLOCK_COOKIE)?.value ?? 0);
  return Number.isFinite(raw) ? clampOffset(raw) : 0;
});

export const getNow = cache(async (): Promise<number> => Date.now() + (await getClockOffset()));
