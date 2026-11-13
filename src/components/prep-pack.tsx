/**
 * "Before your interview": the rubric in the student's words, the pass rule, a checklist,
 * and on a retake, their own last feedback with the criteria that held them back.
 * Server-rendered; the native <details> element handles expand/collapse with no script.
 */
import { CheckCircle2, ChevronDown, ClipboardList, Quote, Target } from "lucide-react";
import type { PrepPack as Pack } from "@/domain/prep";
import { fmtDay } from "@/lib/time";
import { Card, cn } from "./ui";

export function PrepPack({ pack, badgeName }: { pack: Pack; badgeName: string }) {
  const retake = !!pack.lastAttempt;
  return (
    <Card className="overflow-hidden" aria-label={`${pack.title}: ${badgeName}`}>
      <div className="flex items-start gap-3 px-5 pt-5 sm:px-7">
        <span className={cn("mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl", retake ? "bg-warning-soft text-warning" : "bg-primary-soft text-primary")}>
          {retake ? <Target aria-hidden className="size-5" /> : <ClipboardList aria-hidden className="size-5" />}
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Prep · {badgeName}</p>
          <h3 className="mt-0.5 font-display text-xl leading-tight">{pack.title}</h3>
          <p className="mt-1 text-sm text-muted">{pack.intro}</p>
        </div>
      </div>

      {pack.lastAttempt && (
        <div className="mx-5 mt-4 rounded-2xl border border-warning/20 bg-warning-soft/60 p-4 sm:mx-7">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-warning">
            <Quote aria-hidden className="size-3.5" /> Your interviewer&apos;s feedback · {fmtDay(pack.lastAttempt.when)}
          </p>
          <blockquote className="mt-2 text-[15px] leading-relaxed text-ink/90">{pack.lastAttempt.feedback}</blockquote>
          {pack.lastAttempt.focus.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-muted">Focus on:</span>
              {pack.lastAttempt.focus.map((f) => (
                <span key={f} className="rounded-full bg-surface px-2.5 py-1 text-xs font-semibold text-warning ring-1 ring-warning/20">
                  {f}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <details className="group mt-4 border-t border-line" open={retake}>
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-5 text-sm font-semibold hover:bg-sunken/60 sm:px-7 [&::-webkit-details-marker]:hidden">
          What you&apos;ll be scored on
          <ChevronDown aria-hidden className="size-4 text-muted transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-5 px-5 pb-5 sm:px-7">
          <ul className="divide-y divide-line rounded-2xl border border-line">
            {pack.criteria.map((c) => (
              <li key={c.key} className="px-4 py-3">
                {/* The chip sits on the name's line so the description keeps the full width on a phone. */}
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold">
                  {c.label}
                  {c.lastTime && <span className="rounded-full bg-warning-soft px-2 py-0.5 text-xs font-semibold text-warning">{c.lastTime}</span>}
                </p>
                <p className="mt-0.5 text-sm text-muted">{c.lookFor}</p>
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted">{pack.passRule}</p>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">On the day</p>
            <ul className="mt-2 space-y-2">
              {pack.checklist.map((item) => (
                <li key={item} className="flex gap-2.5 text-sm">
                  <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </details>
    </Card>
  );
}
