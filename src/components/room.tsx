/**
 * The interview room: everything the interviewer needs for one interview on one
 * screen. The student's record on the left, the scorecard on the right.
 * Shared by the interviewer's own page and the side-by-side demo.
 */
import { Award, CircleCheck, CircleDashed, History, Medal, Video } from "lucide-react";
import { MS, POLICY } from "@/domain/policy";
import { criteriaFor } from "@/domain/rubric";
import { fmtDate, fmtDayTime, fmtRange, relDay } from "@/lib/time";
import type { getInterviewRoom } from "@/server/queries";
import { Countdown } from "./client";
import { ReleaseButton, Scorecard } from "./interviewer-actions";
import { Avatar, buttonClass, Card, Chip, cn, Eyebrow } from "./ui";

type Room = NonNullable<Awaited<ReturnType<typeof getInterviewRoom>>>;

const OUTCOME_LABEL: Record<string, string> = { pass: "Passed", fail: "Not cleared", retake: "Retake later", no_show: "No-show" };
const OUTCOME_TONE = { pass: "success", fail: "warning", retake: "info", no_show: "danger" } as const;

export function RoomView({ room, now, offset, canRelease, demo = false, compact = false }: { room: Room; now: number; offset: number; canRelease: boolean; demo?: boolean; compact?: boolean }) {
  const { booking, student, badge, candidacy, skills, attempts } = room;
  const criteria = criteriaFor(room.requirements);
  const started = now >= booking.startsAt;
  const live = started && now < booking.endsAt;
  const recorded = booking.status === "completed";
  const joinOpen = !recorded && now >= booking.startsAt - POLICY.joinWindowMinutes * MS.MINUTE && now < booking.endsAt;

  const timer = recorded ? null : live ? { label: "Live · ends in", target: booking.endsAt } : started ? { label: "Ended", target: booking.endsAt } : { label: "Starts in", target: booking.startsAt };

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-5 p-5 sm:p-6">
          <Avatar name={student.name} size="lg" />
          <div className="min-w-0 flex-1">
            <Eyebrow>
              {badge.tier} · {badge.track}
            </Eyebrow>
            <h1 className={cn("mt-1 font-display leading-tight", compact ? "text-2xl" : "text-3xl")}>{student.name}</h1>
            <p className="mt-1 text-sm text-muted">
              {student.campus} campus · {relDay(booking.startsAt, now)}, {fmtRange(booking.startsAt, booking.endsAt)} IST{!compact && ` · with ${room.interviewerName}`}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Chip>Attempt {booking.attemptNo}</Chip>
              {candidacy.noShowCount > 0 && <Chip tone="warning">Missed {candidacy.noShowCount} before</Chip>}
              {recorded && booking.outcome && <Chip tone={OUTCOME_TONE[booking.outcome]}>{OUTCOME_LABEL[booking.outcome]}</Chip>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {timer && (
              <div className={cn("rounded-2xl px-4 py-2.5 text-right", live ? "bg-primary text-on-primary" : "bg-sunken")}>
                <p className={cn("flex items-center justify-end gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em]", live ? "text-on-primary/80" : "text-muted")}>
                  {live && <span aria-hidden className="animate-pulse-dot size-1.5 rounded-full bg-on-primary" />}
                  {timer.label}
                </p>
                {started && !live ? (
                  <p className="text-sm font-semibold">Record the outcome</p>
                ) : (
                  <Countdown target={timer.target} serverNow={now} offset={offset} className="text-2xl font-semibold" />
                )}
              </div>
            )}
            {joinOpen && (
              <a href={`/call/${booking.id}`} target="_blank" rel="noreferrer" className={buttonClass("primary")}>
                <Video aria-hidden className="size-4" /> Join call
              </a>
            )}
            {canRelease && !started && !recorded && <ReleaseButton bookingId={booking.id} student={student.name} when={`${fmtDayTime(booking.startsAt)} IST`} size="md" />}
          </div>
        </div>
      </Card>

      <div className={cn("grid gap-6", !compact && "lg:grid-cols-[20rem_minmax(0,1fr)]")}>
        <div className={cn("space-y-6 lg:sticky lg:top-24 lg:self-start", compact && "hidden")}>
          <Card className="p-5">
            <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Skills cleared for this badge</h2>
            <ul className="mt-3 space-y-3">
              {skills.map((s) => (
                <li key={s.skill} className="flex items-start gap-3 text-sm">
                  {s.result ? (
                    <Medal aria-hidden className={cn("mt-0.5 size-4 shrink-0", s.result === "gold" ? "text-gold" : "text-faint")} />
                  ) : (
                    <CircleDashed aria-hidden className="mt-0.5 size-4 shrink-0 text-faint" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold">
                      {s.skill} L{s.level}
                    </span>
                    <span className="block text-xs text-muted">{s.result ? `${s.result === "gold" ? "Gold" : "Silver"} · cleared ${fmtDate(s.clearedAt!)}` : "Not cleared"}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4 border-t border-line pt-3 text-xs text-muted">Gold and silver are contest results. Probe the silver ones a little harder.</p>
          </Card>

          <Card className="p-5">
            <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              <History aria-hidden className="size-4" /> Earlier attempts
            </h2>
            {attempts.filter((a) => a.id !== booking.id).length === 0 ? (
              <p className="mt-3 text-sm text-muted">First interview for this badge.</p>
            ) : (
              <ol className="mt-3 space-y-4">
                {attempts
                  .filter((a) => a.id !== booking.id)
                  .map((a) => (
                    <li key={a.id} className="text-sm">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{fmtDate(a.startsAt)}</span>
                        {a.outcome && <Chip tone={OUTCOME_TONE[a.outcome]}>{OUTCOME_LABEL[a.outcome]}</Chip>}
                      </p>
                      <p className="text-xs text-muted">with {a.interviewer}</p>
                      {a.studentFeedback && <p className="mt-1.5 border-l-2 border-line pl-3 text-muted">{a.studentFeedback}</p>}
                      {a.scores.length > 0 && <ScoreBars scores={a.scores} />}
                    </li>
                  ))}
              </ol>
            )}
          </Card>
        </div>

        <Card className="p-5 sm:p-6">
          {recorded ? (
            <RecordedSummary room={room} />
          ) : (
            <>
              <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h2 className="text-xl font-semibold">Scorecard</h2>
                  <p className="text-sm text-muted">Same criteria for every interviewer. 1 Not yet · 2 Partly · 3 Solid · 4 Strong.</p>
                </div>
              </div>
              <Scorecard
                bookingId={booking.id}
                student={student.name}
                criteria={criteria}
                started={started}
                noShowAllowed={now >= booking.startsAt + POLICY.noShowGraceMinutes * MS.MINUTE}
                demo={demo}
              />
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

function ScoreBars({ scores }: { scores: { label: string; score: number }[] }) {
  return (
    <ul className="mt-2 space-y-1" aria-label="Scores">
      {scores.map((s) => (
        <li key={s.label} className="flex items-center gap-2 text-xs">
          <span className="w-32 truncate text-muted">{s.label}</span>
          <span className="flex flex-1 gap-0.5" aria-hidden>
            {[1, 2, 3, 4].map((n) => (
              <span key={n} className={cn("h-1.5 flex-1 rounded-full", n <= s.score ? (s.score <= 1 ? "bg-danger" : "bg-primary") : "bg-line")} />
            ))}
          </span>
          <span className="w-3 text-right font-semibold tabular-nums">{s.score}</span>
        </li>
      ))}
    </ul>
  );
}

function RecordedSummary({ room }: { room: Room }) {
  const { booking } = room;
  const current = room.attempts.find((a) => a.id === booking.id);
  const outcome = booking.outcome ?? "pass";
  return (
    <div>
      <div className="flex items-center gap-3">
        <span className={cn("flex size-11 items-center justify-center rounded-2xl", outcome === "pass" ? "bg-success-soft text-success" : "bg-sunken text-muted")}>
          {outcome === "pass" ? <Award aria-hidden className="size-5" /> : <CircleCheck aria-hidden className="size-5" />}
        </span>
        <div>
          <h2 className="text-xl font-semibold">Outcome recorded: {OUTCOME_LABEL[outcome]}</h2>
          <p className="text-sm text-muted">{booking.recordedAt ? `${fmtDayTime(booking.recordedAt)} IST. The student has been told.` : "The student has been told."}</p>
        </div>
      </div>
      {booking.studentFeedback && (
        <blockquote className="mt-5 rounded-2xl bg-sunken p-4 text-sm">
          <span className="block text-xs font-semibold uppercase tracking-[0.12em] text-muted">Feedback the student sees</span>
          <span className="mt-1 block">“{booking.studentFeedback}”</span>
        </blockquote>
      )}
      {booking.internalNotes && (
        <p className="mt-3 text-sm text-muted">
          <strong className="text-ink">Internal note:</strong> {booking.internalNotes}
        </p>
      )}
      {current && current.scores.length > 0 && (
        <div className="mt-5">
          <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Scorecard</h3>
          <ScoreBars scores={current.scores} />
        </div>
      )}
    </div>
  );
}
