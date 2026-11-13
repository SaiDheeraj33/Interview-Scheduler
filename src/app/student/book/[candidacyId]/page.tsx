import { ArrowLeft, CalendarX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/shell";
import { SlotPicker, type PickerDay } from "@/components/student-actions";
import { buttonClass, EmptyState, TONE } from "@/components/ui";
import { checkCanBook, checkCanReschedule, deriveState } from "@/domain/journey";
import { POLICY } from "@/domain/policy";
import { dayKey, fmtDayLong, fmtDayNum, fmtDayTime, fmtMonth, fmtRange, fmtTime, fmtWeekday, istHour } from "@/lib/time";
import { getCandidacyForStudent, getOpenTimes } from "@/server/queries";
import { getNow } from "@/server/clock";
import { requireRole } from "@/server/session";

export const metadata: Metadata = { title: "Book your interview" };
export const dynamic = "force-dynamic";

export default async function BookPage({ params }: { params: Promise<{ candidacyId: string }> }) {
  const user = await requireRole("student");
  const { candidacyId } = await params;
  const now = await getNow();
  const row = await getCandidacyForStudent(candidacyId, user.id);
  if (!row) notFound();

  const { c, badge, live } = row;
  const state = deriveState(c, live?.b ?? null, now);
  const moving = state === "BOOKED" && live !== null;
  const allowed = moving ? checkCanReschedule(c, live.b.startsAt, now) : checkCanBook(state);

  const times = allowed.ok ? await getOpenTimes(user.id, now) : [];
  const days: PickerDay[] = [];
  for (const t of times) {
    if (moving && t.startsAt === live.b.startsAt) continue;
    const key = dayKey(t.startsAt);
    let day = days.find((d) => d.key === key);
    if (!day) {
      day = { key, weekday: fmtWeekday(t.startsAt), dayNum: fmtDayNum(t.startsAt), month: fmtMonth(t.startsAt), long: fmtDayLong(t.startsAt), times: [] };
      days.push(day);
    }
    day.times.push({ startsAt: t.startsAt, label: fmtTime(t.startsAt), range: fmtRange(t.startsAt, t.endsAt), hour: istHour(t.startsAt), last: t.interviewers === 1 });
  }

  const rules = moving
    ? ["This is your one reschedule. The new time will be final.", "Your current slot is released for other students as soon as you confirm.", "Your interviewer may change."]
    : [
        `You can reschedule once or cancel, up to ${POLICY.changeCutoffHours} hours before the start.`,
        `The join link appears on your dashboard ${POLICY.joinWindowMinutes} minutes before.`,
        "An interviewer is assigned when you confirm.",
      ];

  return (
    <AppShell user={user} active="/student" width="max-w-5xl">
      <Link href="/student" className="inline-flex min-h-9 items-center gap-1.5 rounded-lg text-sm font-semibold text-primary hover:underline">
        <ArrowLeft aria-hidden className="size-4" /> Back to my interviews
      </Link>
      <h1 className="mt-4 font-display text-3xl sm:text-4xl">{moving ? "Reschedule your interview" : "Book your interview"}</h1>
      <p className="mt-1 text-muted">
        {badge.tier} badge · {badge.track}. {POLICY.slotMinutes} minutes, online. Times are in IST.
      </p>

      {moving && allowed.ok && (
        <p className={`mt-5 rounded-xl border px-4 py-3 text-sm ${TONE.info.panel}`}>
          You are currently booked for <strong>{fmtDayTime(live.b.startsAt)} IST</strong> with {live.interviewer}. Nothing changes until you confirm a new time.
        </p>
      )}

      <div className="mt-6">
        {!allowed.ok ? (
          <EmptyState icon={<CalendarX aria-hidden className="size-6" />} title="Booking isn't available right now">
            <p>{allowed.message}</p>
            <Link href="/student" className={`${buttonClass("secondary")} mt-4`}>
              Back to my interviews
            </Link>
          </EmptyState>
        ) : days.length === 0 ? (
          <EmptyState icon={<CalendarX aria-hidden className="size-6" />} title={`No open slots in the next ${POLICY.horizonDays} days`}>
            <p>
              Every interviewer is fully booked. New slots are added through the week, so check back tomorrow. The interview team can see that you are waiting, and you
              don&apos;t lose your eligibility.
            </p>
          </EmptyState>
        ) : (
          <SlotPicker candidacyId={c.id} days={days} mode={moving ? "reschedule" : "book"} rules={rules} />
        )}
      </div>
    </AppShell>
  );
}
