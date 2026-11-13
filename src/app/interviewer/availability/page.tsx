import type { Metadata } from "next";
import { AvailabilityGrid, type GridDay } from "@/components/availability-grid";
import { AppShell } from "@/components/shell";
import { PageHeader } from "@/components/ui";
import { MS, POLICY } from "@/domain/policy";
import { dayKey, fmtDayLong, fmtDayNum, fmtWeekday, startOfDay } from "@/lib/time";
import { getNow } from "@/server/clock";
import { getInterviewerSlots } from "@/server/queries";
import { requireRole } from "@/server/session";

export const metadata: Metadata = { title: "Availability" };
export const dynamic = "force-dynamic";

export default async function AvailabilityPage() {
  const user = await requireRole("interviewer");
  const now = await getNow();
  const today = startOfDay(now);
  const mine = await getInterviewerSlots(user.id, today, today + (POLICY.horizonDays + 1) * MS.DAY);
  const byStart = new Map(mine.map((s) => [s.startsAt, s.booked]));

  const step = POLICY.slotMinutes / 60;
  const hours: number[] = [];
  for (let h = POLICY.dayStartHour; h < POLICY.dayEndHour; h += step) hours.push(h);
  const rowLabels = hours.map((h) => `${Math.floor(h)}:${h % 1 ? "30" : "00"}`);

  const days: GridDay[] = Array.from({ length: POLICY.horizonDays }, (_, d) => {
    const dayStart = today + d * MS.DAY;
    return {
      key: dayKey(dayStart),
      weekday: fmtWeekday(dayStart),
      dayNum: fmtDayNum(dayStart),
      long: fmtDayLong(dayStart),
      isToday: d === 0,
      cells: hours.map((h) => {
        const startsAt = dayStart + h * MS.HOUR;
        const booked = byStart.get(startsAt);
        return { startsAt, state: booked ? "booked" : startsAt <= now ? "past" : booked === false ? "open" : "off" };
      }),
    };
  });
  const weeks = [
    { label: "This week", days: days.slice(0, 7) },
    { label: "Next week", days: days.slice(7, 14) },
  ];
  const open = mine.filter((s) => !s.booked && s.startsAt > now).length;

  return (
    <AppShell user={user} active="/interviewer/availability">
      <PageHeader
        eyebrow="Availability"
        title="When can students book you?"
        lead={
          <>
            Students see any slot you open, from {POLICY.minNoticeHours} hours ahead. You have <strong className="text-ink">{open} open slots</strong> in the next{" "}
            {POLICY.horizonDays} days. Booked slots are locked here; use “I can&apos;t make it” on your schedule so the student is moved or told.
          </>
        }
      />
      <div className="mt-8">
        <AvailabilityGrid weeks={weeks} rowLabels={rowLabels} />
      </div>
    </AppShell>
  );
}
