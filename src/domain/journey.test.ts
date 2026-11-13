import { describe, expect, it } from "vitest";
import {
  checkCanBook,
  checkCanChange,
  checkCanRecord,
  checkCanReschedule,
  checkSlotTime,
  clearFlagPatch,
  deriveState,
  flagPatch,
  outcomePatch,
  type CandidacySnapshot,
} from "./journey";
import { MS, POLICY } from "./policy";

const NOW = Date.UTC(2026, 10, 12, 6, 0); // 12 Nov 2026, 11:30 IST, on the 30-minute grid
const base: CandidacySnapshot = { status: "eligible", lastOutcome: null, bookableFrom: null, attemptCount: 0, noShowCount: 0, reschedulesUsed: 0, statusBeforeFlag: null };
const booking = (startsAt: number) => ({ startsAt, endsAt: startsAt + 30 * MS.MINUTE });
const apply = (c: CandidacySnapshot, patch: Partial<CandidacySnapshot> | null): CandidacySnapshot => ({ ...c, ...patch });

describe("deriveState", () => {
  it("is NOT_ELIGIBLE with no candidacy", () => expect(deriveState(null, null, NOW)).toBe("NOT_ELIGIBLE"));
  it("is ELIGIBLE for a first-timer", () => expect(deriveState(base, null, NOW)).toBe("ELIGIBLE"));

  it("moves BOOKED -> IN_PROGRESS -> AWAITING_RESULT on the clock alone", () => {
    const c = { ...base, status: "booked" as const };
    const b = booking(NOW + MS.HOUR);
    expect(deriveState(c, b, NOW)).toBe("BOOKED");
    expect(deriveState(c, b, b.startsAt)).toBe("IN_PROGRESS");
    expect(deriveState(c, b, b.endsAt - 1)).toBe("IN_PROGRESS");
    expect(deriveState(c, b, b.endsAt)).toBe("AWAITING_RESULT");
  });

  it("fails safe to bookable if a booked candidacy has lost its booking", () => {
    expect(deriveState({ ...base, status: "booked" }, null, NOW)).toBe("ELIGIBLE");
  });

  it("is COOLDOWN until bookableFrom, then RETAKE_READY", () => {
    const c = { ...base, lastOutcome: "fail" as const, bookableFrom: NOW + MS.DAY };
    expect(deriveState(c, null, NOW)).toBe("COOLDOWN");
    expect(deriveState(c, null, NOW + MS.DAY)).toBe("RETAKE_READY");
  });
});

describe("outcomes", () => {
  const booked = { ...base, status: "booked" as const, reschedulesUsed: 1 };

  it("pass awards the badge", () => {
    const after = apply(booked, outcomePatch(booked, "pass", NOW));
    expect(after).toMatchObject({ status: "passed", attemptCount: 1, reschedulesUsed: 0 });
    expect(deriveState(after, null, NOW)).toBe("PASSED");
  });

  it("fail counts an attempt and starts a 5-day cooldown", () => {
    const after = apply(booked, outcomePatch(booked, "fail", NOW));
    expect(after).toMatchObject({ status: "eligible", attemptCount: 1, bookableFrom: NOW + POLICY.failCooldownDays * MS.DAY });
    expect(checkCanBook(deriveState(after, null, NOW)).ok).toBe(false);
    expect(checkCanBook(deriveState(after, null, NOW + 5 * MS.DAY)).ok).toBe(true);
  });

  it("retake costs the student nothing: no attempt, no cooldown, reschedule restored", () => {
    const after = apply(booked, outcomePatch(booked, "retake", NOW));
    expect(after).toMatchObject({ status: "eligible", attemptCount: 0, bookableFrom: null, reschedulesUsed: 0 });
    expect(deriveState(after, null, NOW)).toBe("RETAKE_READY");
  });

  it("no-show is tracked separately from attempts", () => {
    const after = apply(booked, outcomePatch(booked, "no_show", NOW));
    expect(after).toMatchObject({ attemptCount: 0, noShowCount: 1, bookableFrom: NOW + POLICY.noShowCooldownDays * MS.DAY });
  });

  it("cannot be recorded before the interview starts, and a no-show needs the grace period", () => {
    const start = NOW;
    expect(checkCanRecord(start, "pass", start - 1).ok).toBe(false);
    expect(checkCanRecord(start, "pass", start).ok).toBe(true);
    expect(checkCanRecord(start, "no_show", start + 9 * MS.MINUTE).ok).toBe(false);
    expect(checkCanRecord(start, "no_show", start + 10 * MS.MINUTE).ok).toBe(true);
  });
});

describe("booking rules", () => {
  it("enforces notice, horizon and the slot grid", () => {
    expect(checkSlotTime(NOW + 3 * MS.HOUR, NOW)).toMatchObject({ ok: false, code: "TOO_SOON" });
    expect(checkSlotTime(NOW + 4 * MS.HOUR, NOW).ok).toBe(true);
    expect(checkSlotTime(NOW + 15 * MS.DAY, NOW)).toMatchObject({ ok: false, code: "TOO_FAR" });
    expect(checkSlotTime(NOW + 5 * MS.HOUR + 7 * MS.MINUTE, NOW)).toMatchObject({ ok: false, code: "OFF_GRID" });
  });

  it("closes changes 12 hours before, and allows one reschedule", () => {
    const start = NOW + MS.DAY;
    expect(checkCanChange(start, start - 12 * MS.HOUR).ok).toBe(true);
    expect(checkCanChange(start, start - 12 * MS.HOUR + 1)).toMatchObject({ ok: false, code: "CHANGE_CUTOFF" });
    expect(checkCanReschedule({ reschedulesUsed: 0 }, start, NOW).ok).toBe(true);
    expect(checkCanReschedule({ reschedulesUsed: 1 }, start, NOW)).toMatchObject({ ok: false, code: "NO_RESCHEDULES_LEFT" });
  });

  it("only ELIGIBLE and RETAKE_READY can book", () => {
    const bookable = (["NOT_ELIGIBLE", "ELIGIBLE", "BOOKED", "IN_PROGRESS", "AWAITING_RESULT", "PASSED", "COOLDOWN", "RETAKE_READY", "BLOCKED", "NULLIFIED"] as const).filter(
      (s) => checkCanBook(s).ok,
    );
    expect(bookable).toEqual(["ELIGIBLE", "RETAKE_READY"]);
  });
});

describe("malpractice flag", () => {
  it("nullifies a passed badge and restores it if the flag is cleared", () => {
    const passed = { ...base, status: "passed" as const, lastOutcome: "pass" as const, attemptCount: 1 };
    const flagged = apply(passed, flagPatch(passed));
    expect(deriveState(flagged, null, NOW)).toBe("NULLIFIED");
    expect(deriveState(apply(flagged, clearFlagPatch(flagged)), null, NOW)).toBe("PASSED");
  });

  it("blocks a student who has not passed yet, and reopens booking when cleared", () => {
    const booked = { ...base, status: "booked" as const };
    const flagged = apply(booked, flagPatch(booked));
    expect(deriveState(flagged, null, NOW)).toBe("BLOCKED");
    expect(checkCanBook("BLOCKED").ok).toBe(false);
    // The booking was cancelled when the flag was raised, so clearing returns to bookable, not booked.
    expect(deriveState(apply(flagged, clearFlagPatch(flagged)), null, NOW)).toBe("ELIGIBLE");
  });

  it("cannot be raised twice or cleared when absent", () => {
    expect(flagPatch({ ...base, status: "blocked" })).toBeNull();
    expect(clearFlagPatch(base)).toBeNull();
  });
});
