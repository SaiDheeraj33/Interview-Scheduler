import { CalendarArrowDown, CalendarPlus, Hourglass, Inbox, Sparkles, Trophy, Video } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Countdown, LiveRefresh } from "@/components/client";
import { JourneyCard, StandingStrip } from "@/components/journey";
import { PrepPack } from "@/components/prep-pack";
import { AppShell } from "@/components/shell";
import { CancelBookingButton } from "@/components/student-actions";
import { Avatar, buttonClass, Card, EmptyState } from "@/components/ui";
import { MS, POLICY } from "@/domain/policy";
import { fmtDate, fmtDayNum, fmtDayTime, fmtMonth, fmtRange, fmtTime, fmtWeekday, istHour, relDay } from "@/lib/time";
import { getClockOffset, getNow } from "@/server/clock";
import { getStudentHome, type JourneyView } from "@/server/queries";
import { requireRole } from "@/server/session";

export const metadata: Metadata = { title: "My interviews" };
export const dynamic = "force-dynamic";

interface Clock {
  now: number;
  offset: number;
}

/** The state-specific block inside the journey card: the thing the student most needs to see. */
function Feature({ j, clock }: { j: JourneyView; clock: Clock }) {
  const { now, offset } = clock;
  const k = j.booking;
  if ((j.state === "BOOKED" || j.state === "IN_PROGRESS") && k) {
    const live = j.state === "IN_PROGRESS";
    return (
      <div className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-[auto_1fr_auto]">
        <div className="flex items-center gap-4 bg-surface px-5 py-4">
          <div className="flex w-14 flex-col items-center rounded-xl border border-line py-1.5 text-center">
            <span className="text-[11px] font-semibold uppercase text-primary">{fmtWeekday(k.startsAt)}</span>
            <span className="text-2xl font-semibold leading-none tabular-nums">{fmtDayNum(k.startsAt)}</span>
            <span className="text-[11px] text-muted">{fmtMonth(k.startsAt)}</span>
          </div>
          <div>
            <p className="font-semibold tabular-nums">{fmtRange(k.startsAt, k.endsAt)}</p>
            <p className="text-sm text-muted">{relDay(k.startsAt, now)} · Online · IST</p>
          </div>
        </div>
        <div className="flex items-center gap-3 bg-surface px-5 py-4">
          <Avatar name={k.interviewer} size="sm" />
          <div>
            <p className="text-sm font-semibold">{k.interviewer}</p>
            <p className="text-xs text-muted">Your interviewer</p>
          </div>
        </div>
        <div className="bg-surface px-5 py-4 sm:text-right">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{live ? "Ends in" : "Starts in"}</p>
          <Countdown target={live ? k.endsAt : k.startsAt} serverNow={now} offset={offset} className="text-2xl font-semibold" />
        </div>
      </div>
    );
  }
  if (j.state === "AWAITING_RESULT" && k) {
    const due = k.endsAt + POLICY.outcomeSlaHours * MS.HOUR;
    return (
      <p className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-5 py-4 text-sm">
        <Hourglass aria-hidden className="size-5 shrink-0 text-info" />
        <span>
          Result expected by <strong>{fmtDayTime(due)} IST</strong> at the latest.
        </span>
      </p>
    );
  }
  if (j.state === "COOLDOWN" && j.bookableFrom) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-5 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Booking opens</p>
          <p className="font-semibold">{fmtDayTime(j.bookableFrom)} IST</p>
        </div>
        <Countdown target={j.bookableFrom} serverNow={now} offset={offset} className="text-2xl font-semibold text-warning" />
      </div>
    );
  }
  if (j.state === "PASSED")
    return (
      <div className="flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-2 rounded-full bg-ink px-3 py-1.5 text-sm font-semibold text-[#e9c46a]">
          <Trophy aria-hidden className="size-4" /> +{j.badge.bonusMiles.toLocaleString("en-IN")} bonus Miles
        </span>
        <span className="inline-flex items-center gap-2 rounded-full bg-surface px-3 py-1.5 text-sm font-semibold text-success ring-1 ring-success/20">
          <Sparkles aria-hidden className="size-4" /> Qualifier: you&apos;re in
        </span>
      </div>
    );
  return null;
}

function Actions({ j, now }: { j: JourneyView; now: number }) {
  const bookHref = `/student/book/${j.candidacyId}`;
  if (j.copy.cta === "book" || j.copy.cta === "rebook")
    return (
      <Link href={bookHref} className={buttonClass("primary", "lg")}>
        <CalendarPlus aria-hidden className="size-5" />
        {j.copy.cta === "book" ? "Book your interview" : "Book a new slot"}
      </Link>
    );
  const k = j.booking;
  if (!k || j.state === "AWAITING_RESULT") return null;
  const joinOpen = now >= k.startsAt - POLICY.joinWindowMinutes * MS.MINUTE;
  return (
    <>
      {joinOpen ? (
        <a href={`/call/${k.id}`} target="_blank" rel="noreferrer" className={buttonClass("primary", "lg")}>
          <Video aria-hidden className="size-5" /> Join interview
        </a>
      ) : (
        <a href={`/student/calendar/${k.id}`} className={buttonClass("primary")} download>
          <CalendarArrowDown aria-hidden className="size-4" /> Add to calendar
        </a>
      )}
      {j.canReschedule && (
        <Link href={bookHref} className={buttonClass("secondary")}>
          Reschedule
        </Link>
      )}
      {j.canCancel && <CancelBookingButton bookingId={k.id} when={`${fmtDayTime(k.startsAt)} IST`} />}
      {!joinOpen && j.state === "BOOKED" && <span className="text-sm text-muted">Join link opens {fmtTime(k.startsAt - POLICY.joinWindowMinutes * MS.MINUTE)}</span>}
    </>
  );
}

function greeting(now: number) {
  const h = istHour(now);
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default async function StudentHome() {
  const user = await requireRole("student");
  const [now, offset] = await Promise.all([getNow(), getClockOffset()]);
  const { journeys, notifications, standing } = await getStudentHome(user, now);
  const daysLeft = Math.max(0, Math.ceil((POLICY.qualifierDeadline - now) / MS.DAY));

  return (
    <AppShell user={user} active="/student">
      <LiveRefresh />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-muted">{fmtDate(now)}</p>
          <h1 className="mt-1 font-display text-3xl sm:text-4xl">
            {greeting(now)}, {user.name.split(" ")[0]}
          </h1>
        </div>
        {standing.badgesHeld === 0 && (
          <p className="rounded-full border border-line bg-surface px-4 py-2 text-sm text-muted">
            <strong className="text-ink tabular-nums">{daysLeft} days</strong> left to earn a badge for the Qualifier
          </p>
        )}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="order-2 space-y-6 lg:order-1">
          {journeys.length === 0 && (
            <EmptyState icon={<CalendarPlus aria-hidden className="size-6" />} title="No interviews yet">
              Clear the skill levels for a Track Badge in GRIT Contests. Your interview shows up here the moment you qualify.
            </EmptyState>
          )}
          {journeys.map((j, i) => [
            <JourneyCard
              key={j.badge.id}
              hero={i === 0}
              badge={j.badge}
              state={j.state}
              copy={j.copy}
              requirements={j.requirements}
              events={j.events}
              attemptCount={j.attemptCount}
              feature={<Feature j={j} clock={{ now, offset }} />}
              actions={<Actions j={j} now={now} />}
            />,
            j.prep && <PrepPack key={`${j.badge.id}-prep`} pack={j.prep} badgeName={`${j.badge.tier} · ${j.badge.track}`} />,
          ])}
        </div>

        <aside className="order-1 space-y-6 lg:order-2">
          <StandingStrip {...standing} stacked />
          <Card className="hidden p-5 lg:block">
            <MessagesList notifications={notifications} />
          </Card>
        </aside>
      </div>

      <Card className="mt-6 p-5 sm:p-6 lg:hidden">
        <MessagesList notifications={notifications} />
      </Card>
    </AppShell>
  );
}

function MessagesList({ notifications }: { notifications: { id: string; title: string; body: string; createdAt: number }[] }) {
  return (
    <>
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.12em] text-muted">
        <Inbox aria-hidden className="size-4" /> Messages
      </h2>
      {notifications.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Nothing yet. Booking confirmations and results will appear here.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {notifications.slice(0, 6).map((n, i) => (
            <li key={n.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-start gap-2">
                {i === 0 && <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />}
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-snug">{n.title}</p>
                  <time className="text-xs text-muted">{fmtDayTime(n.createdAt)}</time>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{n.body}</p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
