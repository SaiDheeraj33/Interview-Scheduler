import { describe, expect, it } from "vitest";
import { criteriaFor, needsScorecard, suggestOutcome } from "./rubric";

const criteria = criteriaFor([
  { skill: "CS Fundamentals", level: 1 },
  { skill: "UI Engineering", level: 2 },
]);
const all = (score: number) => Object.fromEntries(criteria.map((c) => [c.key, score]));

describe("rubric", () => {
  it("has one criterion per required skill plus the core criteria", () => {
    expect(criteria.map((c) => c.label)).toEqual(["CS Fundamentals L1", "UI Engineering L2", "Owns their work", "Communicates clearly"]);
  });

  it("makes no suggestion until every criterion is scored", () => {
    const s = suggestOutcome(criteria, { [criteria[0]!.key]: 4 });
    expect(s.outcome).toBeNull();
    expect(s.scored).toBe(1);
  });

  it("suggests pass at a solid average with nothing weak", () => {
    expect(suggestOutcome(criteria, all(3)).outcome).toBe("pass");
  });

  it("suggests fail when the average is too low", () => {
    expect(suggestOutcome(criteria, all(2)).outcome).toBe("fail");
  });

  it("suggests fail when any criterion is at 'Not yet', however high the rest", () => {
    const scores = { ...all(4), [criteria[1]!.key]: 1 };
    const s = suggestOutcome(criteria, scores);
    expect(s.average).toBeGreaterThan(3);
    expect(s.outcome).toBe("fail");
  });

  it("only pass and fail need a scorecard", () => {
    expect(["pass", "fail", "retake", "no_show"].map(needsScorecard)).toEqual([true, true, false, false]);
  });
});
