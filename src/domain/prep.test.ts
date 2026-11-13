import { describe, expect, it } from "vitest";
import { prepPackFor } from "./prep";

const requirements = [
  { skill: "Gen AI", level: 2 },
  { skill: "Python", level: 3 },
];

describe("prep pack", () => {
  it("shows the full rubric, pass rule and checklist before a first interview", () => {
    const pack = prepPackFor({ state: "BOOKED", requirements, last: null })!;
    expect(pack.title).toBe("Before your interview");
    expect(pack.criteria.map((c) => c.label)).toEqual(["Gen AI L2", "Python L3", "Owns their work", "Communicates clearly"]);
    expect(pack.criteria[0]!.lookFor).toBe("Use Gen AI at level 2 on a problem you haven't seen before.");
    // Every criterion speaks to the student, never about them.
    for (const c of pack.criteria) expect(c.lookFor).not.toMatch(/\b(their|they|explains|listens|adapts)\b/);
    expect(pack.passRule).toContain("2.75");
    expect(pack.checklist).toHaveLength(3);
    expect(pack.lastAttempt).toBeNull();
  });

  it("turns a failed attempt into feedback plus focus areas, never touching internal notes", () => {
    const pack = prepPackFor({
      state: "COOLDOWN",
      requirements,
      last: { outcome: "fail", feedback: "  Explain your prompt chain.  ", startsAt: 1, scores: { "skill:Gen AI": 2, "skill:Python": 3, "core:ownership": 1, "core:communication": 3 } },
    })!;
    expect(pack.title).toBe("Your plan for the next attempt");
    expect(pack.lastAttempt).toEqual({ feedback: "Explain your prompt chain.", when: 1, focus: ["Gen AI L2", "Owns their work"] });
    expect(pack.criteria.find((c) => c.key === "core:ownership")!.lastTime).toBe("Last time: Not yet");
    expect(pack.criteria.find((c) => c.key === "skill:Python")!.lastTime).toBeUndefined();
    expect(JSON.stringify(pack)).not.toMatch(/internal/i);
  });

  it("does not treat a no-show as an assessed attempt", () => {
    const pack = prepPackFor({ state: "RETAKE_READY", requirements, last: { outcome: "no_show", feedback: null, startsAt: 1, scores: {} } })!;
    expect(pack.lastAttempt).toBeNull();
  });

  it("stays out of the way when it is too late or no longer needed", () => {
    for (const state of ["IN_PROGRESS", "AWAITING_RESULT", "PASSED", "BLOCKED", "NULLIFIED", "NOT_ELIGIBLE"] as const)
      expect(prepPackFor({ state, requirements, last: null })).toBeNull();
  });
});
