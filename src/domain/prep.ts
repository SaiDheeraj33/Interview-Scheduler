/**
 * The prep pack: what a student sees before an interview, built only from what the
 * platform already knows. The same rubric the interviewer scores against, the pass rule
 * in plain words, and on a retake, the student's own last feedback and the criteria that
 * held them back. Internal notes are never part of it.
 *
 * A fail costs the student a waiting period and the team another interview; many fails
 * come from not knowing what is expected rather than from missing skill.
 */
import type { JourneyState } from "./journey";
import { POLICY } from "./policy";
import { criteriaFor, SCALE } from "./rubric";

/** Shown while there is still time to prepare. Not mid-interview, awaiting a result, or after it is settled. */
const PREP_STATES: JourneyState[] = ["ELIGIBLE", "BOOKED", "RETAKE_READY", "COOLDOWN"];

export interface PrepCriterion {
  key: string;
  label: string;
  /** What the interviewer is looking for, in the student's terms. */
  lookFor: string;
  /** Set on a retake when this criterion scored below the bar last time. */
  lastTime?: string;
}

export interface PrepPack {
  title: string;
  intro: string;
  criteria: PrepCriterion[];
  passRule: string;
  checklist: string[];
  lastAttempt: { feedback: string; when: number; focus: string[] } | null;
}

export interface PrepInput {
  state: JourneyState;
  requirements: { skill: string; level: number }[];
  last: { outcome: string | null; feedback: string | null; startsAt: number; scores: Record<string, number> } | null;
}

const SOLID = 3;

/** The core criteria in the student's voice (the rubric's prompts are written for the interviewer). */
const CORE_FOR_STUDENT: Record<string, string> = {
  "core:ownership": "Walk the interviewer through your own contest and project code, and explain why you made each decision.",
  "core:communication": "Explain your reasoning step by step, listen to the question, and adjust when you're challenged.",
};
const label = (score: number) => SCALE[score - 1]!.label;

export function prepPackFor({ state, requirements, last }: PrepInput): PrepPack | null {
  if (!PREP_STATES.includes(state) || requirements.length === 0) return null;

  const criteria: PrepCriterion[] = criteriaFor(requirements).map((c) => {
    const score = last?.scores[c.key];
    return {
      key: c.key,
      label: c.label,
      lookFor: c.kind === "skill" ? `Use ${c.label.replace(/ L(\d+)$/, " at level $1")} on a problem you haven't seen before.` : (CORE_FOR_STUDENT[c.key] ?? c.prompt),
      lastTime: score !== undefined && score < SOLID ? `Last time: ${label(score)}` : undefined,
    };
  });

  // Only an assessed attempt (pass/fail scorecard, or retake feedback) gives the student something to work on.
  const assessed = last && (last.outcome === "fail" || last.outcome === "retake") && last.feedback?.trim();
  const lastAttempt = assessed
    ? { feedback: last.feedback!.trim(), when: last.startsAt, focus: criteria.filter((c) => c.lastTime).map((c) => c.label) }
    : null;

  const retake = state === "RETAKE_READY" || state === "COOLDOWN" || (state === "BOOKED" && !!lastAttempt);
  return {
    title: retake ? "Your plan for the next attempt" : "Before your interview",
    intro: retake
      ? "You'll be scored on the same criteria as last time. Start with what held you back."
      : `Every interviewer scores the same ${criteria.length} things, from "${label(1)}" to "${label(4)}". Here's what they look for.`,
    criteria,
    passRule: `To pass, nothing can be below "${label(POLICY.rubricMinScore)}", and most criteria need to be "${label(SOLID)}" or better (an average of ${POLICY.rubricPassAverage} out of 4).`,
    checklist: [
      "Open your own contest and project code: you'll walk the interviewer through it.",
      "A quiet room, camera on, and a stable connection.",
      `Join from your dashboard: the link opens ${POLICY.joinWindowMinutes} minutes before the start.`,
    ],
    lastAttempt,
  };
}
