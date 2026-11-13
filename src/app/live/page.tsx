import { Inbox, MonitorPlay, Smartphone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LiveRefresh } from "@/components/client";
import { JourneyCard } from "@/components/journey";
import { LiveControls } from "@/components/live-controls";
import { RoomView } from "@/components/room";
import { AppShell } from "@/components/shell";
import { cn, EmptyState, Eyebrow } from "@/components/ui";
import type { User } from "@/db/schema";
import { MS } from "@/domain/policy";
import { fmtDayTime, fmtTime, relDay } from "@/lib/time";
import { getClockOffset, getNow } from "@/server/clock";
import { getInterviewRoom, getLiveBookings, getStudentHome, getUserById } from "@/server/queries";
import { getSession } from "@/server/session";

export const metadata: Metadata = { title: "Live demo" };
export const dynamic = "force-dynamic";

/** Read-only viewer for the demo: sees any interview, like the team lead. */
const DEMO_VIEWER = { id: "demo-viewer", role: "admin" } as User;

/**
 * One interview, both sides, on one screen. The interviewer scores and records on
 * the right; the student's phone on the left updates from the same database the
 * moment the outcome is saved. The demo clock moves the interview into its slot.
 */
export default async function LiveDemo({ searchParams }: { searchParams: Promise<{ b?: string }> }) {
  const [{ b }, now, offset, user, live] = await Promise.all([searchParams, getNow(), getClockOffset(), getSession(), getLiveBookings()]);
  // Default: the most interesting interview: one in progress, else the next one to start.
  const pick = b ?? (live.find((l) => now >= l.booking.startsAt && now < l.booking.endsAt) ?? live.find((l) => l.booking.startsAt > now) ?? live[0])?.booking.id;
  // Keep the choice in the URL, so the view stays on this interview after its outcome is recorded.
  if (!b && pick) redirect(`/live?b=${pick}`);
  const room = pick ? await getInterviewRoom(pick, DEMO_VIEWER) : null;
  const student = room ? await getUserById(room.student.id) : null;
  const home = student ? await getStudentHome(student, now) : null;
  const journey = home?.journeys.find((j) => j.candidacyId === room?.candidacy.id);

  const jumps: { at: number; label: string }[] = [];
  if (room && room.booking.status === "scheduled") {
    if (now < room.booking.startsAt) jumps.push({ at: room.booking.startsAt + 2 * MS.MINUTE, label: "Jump to the interview" });
    else if (now < room.booking.startsAt + 11 * MS.MINUTE) jumps.push({ at: room.booking.startsAt + 11 * MS.MINUTE, label: "Skip 10 minutes in" });
  }

  return (
    <AppShell user={user} active="/live" width="max-w-[90rem]">
      <LiveRefresh every={6000} />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <Eyebrow className="text-gold">Live demo</Eyebrow>
          <h1 className="mt-2 font-display text-3xl sm:text-4xl">One interview, both sides</h1>
          <p className="mt-2 text-muted">
            Score the interview on the right and record the outcome. The student&apos;s phone on the left reads the same database and changes the moment you confirm. Use the
            gold button to move the clock into the interview slot.
          </p>
        </div>
        <LiveControls jumps={jumps} simulated={offset > 0} />
      </div>

      {live.length > 0 && (
        <nav aria-label="Choose an interview" className="mt-6 flex gap-2 overflow-x-auto pb-1">
          {live.map((l) => {
            const active = l.booking.id === room?.booking.id;
            const started = now >= l.booking.startsAt;
            return (
              <Link
                key={l.booking.id}
                href={`/live?b=${l.booking.id}`}
                scroll={false}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors",
                  active ? "border-ink bg-ink text-white" : "border-line bg-surface text-muted hover:text-ink",
                )}
              >
                {started && <span aria-hidden className="animate-pulse-dot size-2 rounded-full bg-danger" />}
                {l.student}
                <span className={cn("font-normal", active ? "text-white/70" : "text-faint")}>
                  {relDay(l.booking.startsAt, now)} {fmtTime(l.booking.startsAt)}
                </span>
              </Link>
            );
          })}
        </nav>
      )}

      {!room || !journey ? (
        <div className="mt-8">
          <EmptyState icon={<MonitorPlay aria-hidden className="size-6" />} title="No interview to show">
            Every booked interview has an outcome. Reset the demo data from the home page to start again.
          </EmptyState>
        </div>
      ) : (
        <div className="mt-6 grid items-start gap-6 xl:grid-cols-[25rem_minmax(0,1fr)]">
          <section data-persona="student" aria-label={`${room.student.name}'s phone`} className="xl:sticky xl:top-24">
            <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              <Smartphone aria-hidden className="size-4" /> {room.student.name.split(" ")[0]}&apos;s phone · student view
            </p>
            <div className="mx-auto max-w-[25rem] rounded-[2.6rem] border border-line-strong bg-ink p-2.5 shadow-float">
              <div className="overflow-hidden rounded-[2.1rem] bg-bg">
                <div className="flex items-center justify-between px-6 pb-1 pt-3 text-[11px] font-semibold text-ink">
                  <span className="tabular-nums">{fmtTime(now).replace(/ [AP]M/, "")}</span>
                  <span aria-hidden className="h-5 w-20 rounded-full bg-ink" />
                  <span>IST</span>
                </div>
                <div className="max-h-[44rem] space-y-4 overflow-y-auto px-3 pb-5 pt-2">
                  <p className="px-1 font-display text-xl">Hi {room.student.name.split(" ")[0]}</p>
                  <JourneyCard key={journey.state} celebrate badge={journey.badge} state={journey.state} copy={journey.copy} />
                  <div className="rounded-2xl border border-line bg-surface p-4">
                    <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                      <Inbox aria-hidden className="size-3.5" /> Latest message
                    </p>
                    {home?.notifications[0] ? (
                      <>
                        <p className="mt-2 text-sm font-semibold">{home.notifications[0].title}</p>
                        <p className="text-xs text-muted">{fmtDayTime(home.notifications[0].createdAt)}</p>
                      </>
                    ) : (
                      <p className="mt-2 text-sm text-muted">No messages yet.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section data-persona="interviewer" aria-label="Interviewer's screen">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted">{room.interviewerName}&apos;s screen · interview room</p>
            <RoomView room={room} now={now} offset={offset} canRelease={false} demo />
          </section>
        </div>
      )}
    </AppShell>
  );
}
