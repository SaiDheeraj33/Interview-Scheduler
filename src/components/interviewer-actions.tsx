"use client";

import { Award, Check, CircleAlert, RotateCcw, Sparkles, UserX, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Outcome } from "@/domain/journey";
import { POLICY } from "@/domain/policy";
import { needsScorecard, SCALE, suggestOutcome, type Criterion } from "@/domain/rubric";
import { recordOutcome, recordOutcomeForDemo, releaseBooking } from "@/server/actions";
import { Modal, ResultNote, Spinner, useAction } from "./client";
import { buttonClass, cn } from "./ui";

const OPTIONS: { value: Outcome; label: string; effect: string; Icon: typeof Award }[] = [
  { value: "pass", label: "Pass", effect: "The badge and bonus Miles are awarded straight away.", Icon: Award },
  { value: "fail", label: "Fail", effect: `Counts as an attempt. The student can rebook after ${POLICY.failCooldownDays} days.`, Icon: X },
  { value: "retake", label: "Retake later", effect: "Couldn't be assessed fairly (connection, time). Not an attempt; the student rebooks now.", Icon: RotateCcw },
  { value: "no_show", label: "No-show", effect: `The student did not join. They can rebook after ${POLICY.noShowCooldownDays} days.`, Icon: UserX },
];

interface Draft {
  scores: Record<string, number>;
  outcome: Outcome | null;
  feedback: string;
  notes: string;
}
const EMPTY: Draft = { scores: {}, outcome: null, feedback: "", notes: "" };

/** Notes survive a refresh or a dropped connection mid-interview. Per browser only; never the record. */
function useDraft(bookingId: string) {
  const key = `grit-scorecard-${bookingId}`;
  const [draft, setDraft] = useState<Draft>(EMPTY);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(key);
      if (saved) setDraft({ ...EMPTY, ...(JSON.parse(saved) as Partial<Draft>) });
    } catch {
      /* storage unavailable: start empty */
    }
  }, [key]);
  const update = (patch: Partial<Draft>) =>
    setDraft((d) => {
      const next = { ...d, ...patch };
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  const clear = () => {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  };
  return [draft, update, clear] as const;
}

/**
 * The scorecard. Score every criterion, see what the rubric suggests, choose the
 * outcome, explain it, then confirm on a second screen that reads back the effect.
 */
export function Scorecard({
  bookingId,
  student,
  criteria,
  started,
  noShowAllowed,
  demo = false,
}: {
  bookingId: string;
  student: string;
  criteria: Criterion[];
  started: boolean;
  noShowAllowed: boolean;
  demo?: boolean;
}) {
  const [draft, update, clearDraft] = useDraft(bookingId);
  const [step, setStep] = useState<"score" | "confirm">("score");
  const { run, pending, result } = useAction();
  const { scores, outcome, feedback, notes } = draft;

  const suggestion = useMemo(() => suggestOutcome(criteria, scores), [criteria, scores]);
  const scorecardNeeded = outcome ? needsScorecard(outcome) : false;
  const override = !!outcome && scorecardNeeded && suggestion.outcome !== null && suggestion.outcome !== outcome;
  const needsFeedback = outcome === "fail" || outcome === "retake";

  const problems: string[] = [];
  if (!outcome) problems.push("Choose an outcome.");
  if (scorecardNeeded && suggestion.outcome === null) problems.push(`Score all ${criteria.length} criteria (${suggestion.scored} done).`);
  if (needsFeedback && feedback.trim().length < 20) problems.push("Write feedback for the student (at least a sentence).");
  if (override && notes.trim().length < 10) problems.push("Explain in the internal notes why the outcome differs from the scorecard.");
  const picked = OPTIONS.find((o) => o.value === outcome);

  const submit = () => {
    if (!outcome) return;
    const input = { bookingId, outcome, studentFeedback: outcome === "no_show" ? "" : feedback, internalNotes: notes, scores: needsScorecard(outcome) ? scores : {} };
    run(() => (demo ? recordOutcomeForDemo(input) : recordOutcome(input)), () => clearDraft());
  };

  if (step === "confirm" && picked)
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-line bg-sunken p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">You are recording</p>
          <p className="mt-1 flex items-center gap-2 text-xl font-semibold">
            <picked.Icon aria-hidden className="size-5" /> {picked.label} for {student}
          </p>
          <p className="mt-2 text-sm">{picked.effect}</p>
          {suggestion.average !== null && scorecardNeeded && (
            <p className="mt-2 text-sm text-muted">
              Scorecard average {suggestion.average.toFixed(2)} · suggested {suggestion.outcome}
              {override && <strong className="text-warning"> · you are overriding it</strong>}
            </p>
          )}
          {feedback.trim() && outcome !== "no_show" && (
            <blockquote className="mt-3 border-l-2 border-primary/40 pl-3 text-sm text-ink/80">
              <span className="block text-xs font-semibold text-muted">The student will read</span>“{feedback.trim()}”
            </blockquote>
          )}
        </div>
        <p className="text-sm text-muted">The student is told immediately. A recorded outcome is final; a correction needs the interview team lead.</p>
        <ResultNote result={result} />
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className={buttonClass("secondary")} onClick={() => setStep("score")} disabled={pending}>
            Back to scorecard
          </button>
          <button type="button" className={buttonClass("primary")} disabled={pending} onClick={submit}>
            {pending ? <Spinner /> : <Check aria-hidden className="size-4" />} Confirm {picked.label.toLowerCase()}
          </button>
        </div>
      </div>
    );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!problems.length) setStep("confirm");
      }}
      className="@container space-y-6"
    >
      {!started && (
        <p className="flex items-start gap-2 rounded-xl bg-info-soft px-4 py-3 text-sm text-info">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          You can prepare notes now. Scores and the outcome are recorded once the interview has started.
        </p>
      )}

      <div className="space-y-3">
        {criteria.map((c, idx) => (
          <fieldset key={c.key} className="grid items-center gap-x-6 gap-y-3 rounded-2xl border border-line p-4 @2xl:grid-cols-[minmax(0,1fr)_17rem]" disabled={!started}>
            <legend className="sr-only">
              {c.label}: {c.prompt}
            </legend>
            <div>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className="font-semibold">
                <span className="mr-2 text-xs tabular-nums text-faint">{String(idx + 1).padStart(2, "0")}</span>
                {c.label}
                {c.kind === "core" && <span className="ml-2 rounded-full bg-sunken px-2 py-0.5 text-[11px] font-semibold text-muted">Every badge</span>}
              </p>
            </div>
            <p className="mt-0.5 text-sm text-muted">{c.prompt}</p>
            </div>
            <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label={`Score for ${c.label}`}>
              {SCALE.map((s) => {
                const on = scores[c.key] === s.score;
                return (
                  <label
                    key={s.score}
                    title={s.hint}
                    className={cn(
                      "flex min-h-12 flex-col items-center justify-center rounded-xl border text-center transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary",
                      on ? "border-primary bg-primary text-on-primary" : "border-line bg-surface hover:border-primary/50",
                      !started && "opacity-60",
                    )}
                  >
                    <input type="radio" className="sr-only" name={c.key} value={s.score} checked={on} onChange={() => update({ scores: { ...scores, [c.key]: s.score } })} />
                    <span className="text-sm font-semibold tabular-nums">{s.score}</span>
                    <span className={cn("text-[11px]", on ? "text-on-primary/85" : "text-muted")}>{s.label}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>

      <div className={cn("rounded-2xl border p-4", suggestion.outcome === "pass" ? "border-success/25 bg-success-soft" : suggestion.outcome === "fail" ? "border-warning/25 bg-warning-soft" : "border-line bg-sunken")} aria-live="polite">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles aria-hidden className="size-4" />
          {suggestion.outcome ? `Scorecard suggests: ${suggestion.outcome === "pass" ? "Pass" : "Fail"}` : "No suggestion yet"}
          {suggestion.average !== null && <span className="ml-auto tabular-nums text-muted">avg {suggestion.average.toFixed(2)}</span>}
        </p>
        <p className="mt-1 text-sm text-muted">{suggestion.reason} You decide; disagreeing just needs a reason.</p>
      </div>

      <fieldset disabled={!started}>
        <legend className="text-sm font-semibold">Outcome</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {OPTIONS.map(({ value, label, effect, Icon }) => {
            const disabled = value === "no_show" && !noShowAllowed;
            const on = outcome === value;
            return (
              <label
                key={value}
                className={cn(
                  "flex gap-3 rounded-2xl border p-3 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary",
                  on ? "border-primary bg-primary-soft" : "border-line hover:border-primary/50",
                  (disabled || !started) && "cursor-not-allowed opacity-55 hover:border-line",
                )}
              >
                <input type="radio" name="outcome" value={value} checked={on} disabled={disabled} onChange={() => update({ outcome: value })} className="mt-1 size-4 accent-(--color-primary)" />
                <span>
                  <span className="flex items-center gap-1.5 font-semibold">
                    <Icon aria-hidden className="size-4" /> {label}
                    {suggestion.outcome === value && <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-semibold text-muted ring-1 ring-line">Suggested</span>}
                  </span>
                  <span className="block text-sm text-muted">{disabled ? `Available ${POLICY.noShowGraceMinutes} minutes after the start.` : effect}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {outcome !== "no_show" && (
        <div>
          <label htmlFor={`feedback-${bookingId}`} className="text-sm font-semibold">
            Feedback for the student {needsFeedback ? <span className="text-danger">(required)</span> : <span className="font-normal text-muted">(optional)</span>}
          </label>
          <p id={`feedback-help-${bookingId}`} className="text-xs text-muted">
            They read this word for word with the result. Say what to work on.
          </p>
          <textarea
            id={`feedback-${bookingId}`}
            aria-describedby={`feedback-help-${bookingId}`}
            value={feedback}
            onChange={(e) => update({ feedback: e.target.value })}
            rows={3}
            maxLength={600}
            className="mt-1.5 w-full rounded-xl border border-line-strong bg-surface p-3 text-sm"
          />
        </div>
      )}
      <div>
        <label htmlFor={`notes-${bookingId}`} className="text-sm font-semibold">
          Internal notes{" "}
          {override ? <span className="text-danger">(required: why you&apos;re overriding the scorecard)</span> : <span className="font-normal text-muted">(never shown to the student)</span>}
        </label>
        <textarea
          id={`notes-${bookingId}`}
          value={notes}
          onChange={(e) => update({ notes: e.target.value })}
          rows={2}
          maxLength={1000}
          className="mt-1.5 w-full rounded-xl border border-line-strong bg-surface p-3 text-sm"
        />
        <p className="mt-1 text-xs text-faint">Saved on this device as you type, until the outcome is recorded.</p>
      </div>

      {started && problems.length > 0 && (
        <ul className="space-y-1 text-sm text-muted" aria-label="Still to do">
          {problems.map((p) => (
            <li key={p} className="flex gap-2">
              <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-faint" />
              {p}
            </li>
          ))}
        </ul>
      )}
      <ResultNote result={result} />
      <div className="flex justify-end">
        <button type="submit" className={buttonClass("primary", "lg")} disabled={!started || problems.length > 0}>
          Review outcome
        </button>
      </div>
    </form>
  );
}

export function ReleaseButton({ bookingId, student, when, size = "sm" }: { bookingId: string; student: string; when: string; size?: "sm" | "md" }) {
  const [open, setOpen] = useState(false);
  const { run, pending, result, clear } = useAction();
  const close = () => {
    setOpen(false);
    clear();
  };
  return (
    <>
      <button type="button" className={buttonClass("ghost", size)} onClick={() => setOpen(true)}>
        I can&apos;t make it
      </button>
      <Modal open={open} onClose={close} title="Can't make this interview?">
        <p className="text-sm text-muted">
          <strong className="text-ink">{student}</strong> is booked for <strong className="text-ink">{when}</strong>. We&apos;ll first try to hand the interview to a colleague
          who is free at the same time, so the student keeps their slot. If nobody is free, the interview is cancelled and the student is asked to rebook, at no cost to them.
        </p>
        <ResultNote result={result} className="mt-3" />
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" className={buttonClass("secondary")} onClick={close}>
            Keep it
          </button>
          <button type="button" className={buttonClass("danger")} disabled={pending} onClick={() => run(() => releaseBooking({ bookingId }), close)}>
            {pending && <Spinner />} Release this interview
          </button>
        </div>
      </Modal>
    </>
  );
}
