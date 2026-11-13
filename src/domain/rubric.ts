/**
 * The interview scorecard. Every interviewer scores the same criteria on the same
 * four-point scale, so outcomes are comparable across interviewers and a student's
 * result never depends on who happened to take the slot.
 *
 * The rubric suggests an outcome; the interviewer decides. When the two disagree the
 * interviewer must say why (enforced in the server action), which is what makes
 * calibration reviews possible later.
 */
import { POLICY } from "./policy";

export const SCALE = [
  { score: 1, label: "Not yet", hint: "Could not show this" },
  { score: 2, label: "Partly", hint: "Shown with heavy prompting" },
  { score: 3, label: "Solid", hint: "Shown independently" },
  { score: 4, label: "Strong", hint: "Shown with depth and trade-offs" },
] as const;
export type Score = (typeof SCALE)[number]["score"];

export interface Criterion {
  key: string;
  label: string;
  prompt: string;
  kind: "skill" | "core";
}

const CORE: Criterion[] = [
  { key: "core:ownership", label: "Owns their work", prompt: "Walks through their own contest and project code and explains each decision.", kind: "core" },
  { key: "core:communication", label: "Communicates clearly", prompt: "Explains reasoning step by step, listens, and adapts when challenged.", kind: "core" },
];

/** One criterion per skill the badge requires, plus two that apply to every badge. */
export function criteriaFor(requirements: { skill: string; level: number }[]): Criterion[] {
  return [
    ...requirements.map((r) => ({
      key: `skill:${r.skill}`,
      label: `${r.skill} L${r.level}`,
      prompt: `Applies ${r.skill} at level ${r.level} to a problem they have not seen before.`,
      kind: "skill" as const,
    })),
    ...CORE,
  ];
}

export interface Suggestion {
  outcome: "pass" | "fail" | null;
  average: number | null;
  scored: number;
  total: number;
  reason: string;
}

export function suggestOutcome(criteria: Criterion[], scores: Partial<Record<string, number>>): Suggestion {
  const values = criteria.map((c) => scores[c.key]).filter((v): v is number => typeof v === "number");
  const total = criteria.length;
  if (values.length < total)
    return { outcome: null, average: null, scored: values.length, total, reason: `Score all ${total} criteria to see a suggestion.` };
  const average = Math.round((values.reduce((a, b) => a + b, 0) / total) * 100) / 100;
  const lowest = Math.min(...values);
  if (lowest < POLICY.rubricMinScore)
    return { outcome: "fail", average, scored: total, total, reason: `A criterion is at "${SCALE[lowest - 1]!.label}". A pass needs every criterion at "${SCALE[POLICY.rubricMinScore - 1]!.label}" or better.` };
  if (average < POLICY.rubricPassAverage)
    return { outcome: "fail", average, scored: total, total, reason: `Average ${average.toFixed(2)}. A pass needs ${POLICY.rubricPassAverage.toFixed(2)} or more.` };
  return { outcome: "pass", average, scored: total, total, reason: `Average ${average.toFixed(2)} with nothing below "${SCALE[POLICY.rubricMinScore - 1]!.label}".` };
}

/** Pass and fail are judgements, so they need a full scorecard. Retake and no-show are not assessments. */
export const needsScorecard = (outcome: string) => outcome === "pass" || outcome === "fail";
