import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight, ClipboardList, History, Video } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Countdown, LiveRefresh } from "@/components/client";
import { ReleaseButton } from "@/components/interviewer-actions";
import { AppShell } from "@/components/shell";
import { Avatar, buttonClass, Card, Chip, cn, Eyebrow } from "@/components/ui";
import { MS, POLICY } from "@/domain/policy";
import type { Tone } from "@/lib/messages";
import { dayKey, dayKeyToStart, fmtDayLong, fmtDayNum, fmtDayTime, fmtRange, fmtTime, fmtWeekday, isDayKey, istHour, relDay, startOfDay } from "@/lib/time";
import { getInterviewerSchedule, getInterviewerWeek, type ScheduleRow } from "@/server/queries";
import { getClockOffset, getNow } from "@/server/clock";
import { requireRole } from "@/server/session";

export const metadata: Metadata = { title: "Schedule" };
export const dynamic = "force-dynamic";

const OUTCOME_CHIP: Record<string, { tone: Tone; label: string }> = {
  pass: { tone: "success", label: "Passed" },
  fail: { tone: "warning", label: "Failed" },
  retake: { tone: "info", label: "Retake later" },
  no_show: { tone: "danger", label: "No-show" },
};

/** Timeline geometry: one row per half hour, working hours only. */
const ROW = 34;
const room = (id: string) => `/interviewer/interview/${id}`;

function statusOf(row: ScheduleRow, now: number) {
  const b = row.booking;
  if (b.outcome) return { ...OUTCOME_CHIP[b.outcome]!, key: "done" as const };
  if (now >= b.startsAt && now < b.endsAt) return { tone: "action" as Tone, label: "Live now", key: "live" as const };
  if (now >= b.endsAt) return { tone: (now - b.endsAt > POLICY.outcomeSlaHours * MS.HOUR ? "danger" : "warning") as Tone, label: "Needs outcome", key: "pending" as const };
  return { tone: "neutral" as Tone, label: `Attempt ${b.attemptNo}`, key: "upcoming" as const };
}

export default async function InterviewerSchedule({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  const user = await requireRole("interviewer");
  const [now, offset] = await Promise.all([getNow(), getClockOffset()]);
  const { day: dayParam } = await searchParams;
  const today = startOfDay(now);
  const dayStart = dayParam && isDayKey(dayParam) ? dayKeyToStart(dayParam) : today;
  const isToday = dayStart === today;

  const [{ day, pending: started }, week, [selectedDay]] = await Promise.all([
    getInterviewerSchedule(user.id, dayStart, now),
    getInterviewerWeek(user.id, today, 7),
    getInterviewerWeek(user.id, dayStart, 1),
  ]);
  // Live interviews show as Up next; only finished ones wait for an outcome.
  const pending = started.filter((r) => r.booking.endsAt <= now);
  const upcoming = day.concat(started).filter((r) => r.booking.status === "scheduled" && r.booking.endsAt > now);
  const allUpcoming = (await getInterviewerSchedule(user.id, today, now)).day.filter((r) => r.booking.status === "scheduled" && r.booking.endsAt > now);
  const next = allUpcoming[0] ?? upcoming[0] ?? null;
  const openStarts = selectedDay?.openStarts ?? [];
  const nav = (offsetDays: number) => `/interviewer?day=${dayKey(dayStart + offsetDays * MS.DAY + MS.HOUR)}`;
  // Working hours, stretched to fit anything booked outside them (and the clock, today).
  const hoursShown = [...day.map((r) => istHour(r.booking.startsAt)), ...(isToday ? [istHour(now)] : [])];
  const START = Math.max(0, Math.min(POLICY.dayStartHour, ...hoursShown.map(Math.floor)));
  const END = Math.min(24, Math.max(POLICY.dayEndHour, ...hoursShown.map((x) => Math.floor(x) + 1)));
  const top = (ms: number) => (istHour(ms) - START) * 2 * ROW;
  const nowTop = isToday ? top(now) : null;
  const first = user.name.split(" ")[0];
  const h = istHour(now);

  return (
    <AppShell user={user} active="/interviewer">
      <LiveRefresh every={15000} />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>{fmtDayLong(now)}</Eyebrow>
          <h1 className="mt-2 font-display text-3xl sm:text-4xl">
            {h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"}, {first}
          </h1>
          <p className="mt-2 text-muted">
            {pending.length
              ? `${pending.length} interview${pending.length === 1 ? " is" : "s are"} waiting for an outcome from you.`
              : allUpcoming.length
                ? `${allUpcoming.length} more interview${allUpcoming.length === 1 ? "" : "s"} today. You're up to date on outcomes.`
                : "Nothing left today, and you're up to date on outcomes."}
          </p>
        </div>
        <Link href="/interviewer/availability" className={buttonClass("secondary")}>
          <CalendarDays aria-hidden className="size-4" /> Set availability
        </Link>
      </div>

      {pending.length > 0 && (
        <Card className="mt-8 overflow-hidden border-warning/30">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-warning/20 bg-warning-soft px-5 py-3">
            <h2 className="flex items-center gap-2 font-semibold text-warning">
              <ClipboardList aria-hidden className="size-4" /> Record these outcomes
            </h2>
            <p className="text-sm text-ink/75">Students see “Awaiting result” until you do. Aim for within {POLICY.outcomeSlaHours} hours.</p>
          </div>
          <ul className="divide-y divide-line">
            {pending.map((row) => {
              const st = statusOf(row, now);
              return (
                <li key={row.booking.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                  <Avatar name={row.student.name} />
                  <div className="min-w-48 flex-1">
                    <p className="font-semibold">{row.student.name}</p>
                    <p className="text-sm text-muted">
                      {relDay(row.booking.startsAt, now)}, {fmtRange(row.booking.startsAt, row.booking.endsAt)} · {row.badge.tier} · {row.badge.track}
                    </p>
                  </div>
                  <Chip tone={st.tone}>{st.key === "pending" && st.tone === "danger" ? "Outcome overdue" : st.label}</Chip>
                  <Link href={room(row.booking.id)} className={buttonClass("primary", "sm")}>
                    {st.key === "live" ? "Open interview room" : "Record outcome"} <ArrowRight aria-hidden className="size-4" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <section aria-labelledby="day-title">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="day-title" className="text-xl font-semibold">
                {isToday ? "Today" : relDay(dayStart, now)} <span className="font-normal text-muted">· {fmtDayLong(dayStart)}</span>
              </h2>
              <p className="text-sm text-muted">
                {day.length} interview{day.length === 1 ? "" : "s"} · {openStarts.length} open slot{openStarts.length === 1 ? "" : "s"}
              </p>
            </div>
            <nav aria-label="Change day" className="flex items-center gap-1.5">
              <Link href={nav(-1)} className={buttonClass("secondary", "sm")} aria-label="Previous day">
                <ChevronLeft aria-hidden className="size-4" />
              </Link>
              {!isToday && (
                <Link href="/interviewer" className={buttonClass("secondary", "sm")}>
                  Today
                </Link>
              )}
              <Link href={nav(1)} className={buttonClass("secondary", "sm")} aria-label="Next day">
                <ChevronRight aria-hidden className="size-4" />
              </Link>
            </nav>
          </div>

          <ol className="mt-4 grid grid-cols-7 gap-1.5" aria-label="This week">
            {week.map((d) => {
              const active = d.dayStart === dayStart;
              return (
                <li key={d.dayStart}>
                  <Link
                    href={`/interviewer?day=${dayKey(d.dayStart + MS.HOUR)}`}
                    aria-current={active ? "date" : undefined}
                    className={cn(
                      "flex flex-col items-center rounded-xl border py-2 transition-colors",
                      active ? "border-primary bg-primary text-on-primary" : "border-line bg-surface hover:border-primary/50",
                    )}
                  >
                    <span className={cn("text-[11px] font-semibold uppercase", active ? "text-on-primary/80" : "text-muted")}>{fmtWeekday(d.dayStart)}</span>
                    <span className="text-lg font-semibold tabular-nums leading-tight">{fmtDayNum(d.dayStart)}</span>
                    <span className="mt-1 flex gap-0.5" aria-label={`${d.interviews} interviews`}>
                      {Array.from({ length: Math.min(d.interviews, 5) }, (_, i) => (
                        <span key={i} className={cn("size-1.5 rounded-full", active ? "bg-on-primary" : "bg-primary")} />
                      ))}
                      {d.interviews === 0 && <span className={cn("size-1.5 rounded-full", active ? "bg-on-primary/30" : "bg-line-strong")} />}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>

          {/* Day timeline */}
          <Card className="mt-4 p-4 sm:p-5">
            <div className="relative" style={{ height: (END - START) * 2 * ROW }}>
              {Array.from({ length: (END - START) * 2 }, (_, i) => (
                <div key={i} className={cn("absolute inset-x-0 flex", i % 2 === 0 ? "border-t border-line" : "border-t border-dashed border-line/60")} style={{ top: i * ROW }}>
                  {i % 2 === 0 && (nowTop === null || Math.abs(i * ROW - nowTop) > 12) && <span className="-mt-2.5 w-12 bg-surface pr-2 text-right text-[11px] tabular-nums text-faint">{`${START + i / 2}:00`}</span>}
                </div>
              ))}
              {openStarts.map((t) => (
                <div
                  key={t}
                  className="absolute left-14 right-0 flex items-center rounded-lg border border-dashed border-primary/30 bg-primary-soft/50 px-3 text-xs font-medium text-primary"
                  style={{ top: top(t) + 2, height: ROW - 4 }}
                >
                  Open · {fmtTime(t)}
                </div>
              ))}
              {day.map((row) => {
                const st = statusOf(row, now);
                return (
                  <Link
                    key={row.booking.id}
                    href={room(row.booking.id)}
                    className={cn(
                      "group absolute left-14 right-0 flex items-center gap-3 overflow-hidden rounded-lg px-3 text-sm shadow-card transition-transform hover:-translate-y-px",
                      st.key === "done" ? "bg-sunken text-muted" : st.key === "pending" ? "bg-warning-soft text-warning ring-1 ring-warning/30" : "bg-primary text-on-primary",
                      st.key === "live" && "ring-2 ring-primary ring-offset-2 ring-offset-surface",
                    )}
                    style={{ top: top(row.booking.startsAt) + 2, height: ROW - 4 }}
                  >
                    <span className="shrink-0 font-semibold tabular-nums">{fmtTime(row.booking.startsAt)}</span>
                    <span className="min-w-0 truncate font-semibold">{row.student.name}</span>
                    <span className={cn("hidden min-w-0 truncate sm:inline", st.key === "done" || st.key === "pending" ? "opacity-80" : "text-on-primary/75")}>
                      {row.badge.tier} · {row.badge.track}
                    </span>
                    <span className={cn("ml-auto shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold", st.key === "done" || st.key === "pending" ? "bg-surface" : "bg-white/15")}>{st.label}</span>
                  </Link>
                );
              })}
              {nowTop !== null && nowTop >= 0 && nowTop <= (END - START) * 2 * ROW && (
                <div className="pointer-events-none absolute inset-x-0 z-10 flex items-center" style={{ top: nowTop }} aria-label={`Now, ${fmtTime(now)}`}>
                  <span className="w-12 pr-1 text-right text-[11px] font-bold tabular-nums text-danger">{fmtTime(now).replace(/ [AP]M/, "")}</span>
                  <span className="size-2 rounded-full bg-danger" />
                  <span className="h-px flex-1 bg-danger" />
                </div>
              )}
              {day.length === 0 && openStarts.length === 0 && (
                <div className="bg-dots absolute inset-y-0 left-14 right-0 flex items-center justify-center rounded-xl">
                  <p className="rounded-full bg-surface px-4 py-2 text-sm text-muted shadow-card">Nothing on this day. Open slots so students can book you.</p>
                </div>
              )}
            </div>
          </Card>
        </section>

        <aside className="space-y-6">
          <Card className="overflow-hidden">
            <div className="border-b border-line px-5 py-4">
              <Eyebrow>Up next</Eyebrow>
            </div>
            {next ? (
              <div className="p-5">
                <div className="flex items-center gap-3">
                  <Avatar name={next.student.name} size="lg" />
                  <div className="min-w-0">
                    <p className="truncate text-lg font-semibold">{next.student.name}</p>
                    <p className="text-sm text-muted">{next.student.campus} campus</p>
                  </div>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-muted">When</dt>
                    <dd className="font-semibold">
                      {relDay(next.booking.startsAt, now)}, {fmtTime(next.booking.startsAt)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">{now >= next.booking.startsAt ? "Ends in" : "Starts in"}</dt>
                    <dd className="font-semibold">
                      <Countdown target={now >= next.booking.startsAt ? next.booking.endsAt : next.booking.startsAt} serverNow={now} offset={offset} />
                    </dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-xs text-muted">Badge</dt>
                    <dd className="font-semibold">
                      {next.badge.tier} · {next.badge.track} <span className="font-normal text-muted">· attempt {next.booking.attemptNo}</span>
                    </dd>
                  </div>
                </dl>
                {next.previousFeedback && (
                  <p className="mt-4 flex gap-2 rounded-xl bg-sunken p-3 text-sm text-muted">
                    <History aria-hidden className="mt-0.5 size-4 shrink-0" />
                    <span>
                      <strong className="text-ink">Last attempt:</strong> {next.previousFeedback}
                    </span>
                  </p>
                )}
                <div className="mt-5 flex flex-wrap gap-2">
                  <Link href={room(next.booking.id)} className={cn(buttonClass("primary"), "flex-1")}>
                    Open interview room
                  </Link>
                  {now >= next.booking.startsAt - POLICY.joinWindowMinutes * MS.MINUTE && (
                    <a href={`/call/${next.booking.id}`} target="_blank" rel="noreferrer" className={buttonClass("secondary")} aria-label="Join the video call">
                      <Video aria-hidden className="size-4" />
                    </a>
                  )}
                </div>
                {now < next.booking.startsAt && (
                  <div className="mt-2">
                    <ReleaseButton bookingId={next.booking.id} student={next.student.name} when={`${fmtDayTime(next.booking.startsAt)} IST`} />
                  </div>
                )}
              </div>
            ) : (
              <p className="p-5 text-sm text-muted">No more interviews today.</p>
            )}
          </Card>

          {day.some((r) => r.booking.status === "scheduled" && r.booking.startsAt > now && r.booking.id !== next?.booking.id) && (
            <Card className="p-5">
              <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Later on this day</h3>
              <ul className="mt-3 space-y-3">
                {day
                  .filter((r) => r.booking.status === "scheduled" && r.booking.startsAt > now && r.booking.id !== next?.booking.id)
                  .map((r) => (
                    <li key={r.booking.id} className="flex items-center gap-3 text-sm">
                      <span className="w-16 shrink-0 font-semibold tabular-nums">{fmtTime(r.booking.startsAt)}</span>
                      <span className="min-w-0 flex-1 truncate">{r.student.name}</span>
                      <ReleaseButton bookingId={r.booking.id} student={r.student.name} when={`${fmtDayTime(r.booking.startsAt)} IST`} />
                    </li>
                  ))}
              </ul>
            </Card>
          )}
        </aside>
      </div>
    </AppShell>
  );
}
