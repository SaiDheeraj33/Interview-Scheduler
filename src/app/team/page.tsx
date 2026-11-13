import type { Metadata } from "next";
import Link from "next/link";
import { CalibrationTable, CapacityChart, Funnel } from "@/components/charts";
import { LiveRefresh } from "@/components/client";
import { AppShell } from "@/components/shell";
import { PipelineList, type PipelineItem } from "@/components/team-actions";
import { Card, cn, Eyebrow, Stat } from "@/components/ui";
import type { JourneyState } from "@/domain/journey";
import { MS, POLICY } from "@/domain/policy";
import { daysBetween, fmtDay, fmtDayTime, fmtGap, startOfDay } from "@/lib/time";
import { getNow } from "@/server/clock";
import { getEventsFor, getPipeline, getTeamInsights, type PipelineRow } from "@/server/queries";
import { requireRole } from "@/server/session";

export const metadata: Metadata = { title: "Team dashboard" };
export const dynamic = "force-dynamic";

const VIEWS = [
  { key: "waiting", label: "Eligible, not booked", states: ["ELIGIBLE", "RETAKE_READY"], empty: "Every eligible student has booked. Nothing to chase." },
  { key: "booked", label: "Booked", states: ["BOOKED", "IN_PROGRESS"], empty: "No interviews booked right now." },
  { key: "awaiting", label: "Awaiting result", states: ["AWAITING_RESULT"], empty: "Every finished interview has an outcome." },
  { key: "decided", label: "Decided", states: ["PASSED", "COOLDOWN"], empty: "No results yet." },
  { key: "flagged", label: "Flagged", states: ["BLOCKED", "NULLIFIED"], empty: "No malpractice flags." },
  { key: "all", label: "All", states: null, empty: "No candidates yet." },
] as const satisfies readonly { key: string; label: string; states: readonly JourneyState[] | null; empty: string }[];

const OUTCOME_LABEL: Record<string, string> = { pass: "Passed", fail: "Failed", retake: "Retake later", no_show: "No-show" };

function detail(row: PipelineRow, now: number): { main: string; sub?: string; alert?: boolean } {
  const c = row.candidacy;
  switch (row.state) {
    case "ELIGIBLE":
    case "RETAKE_READY": {
      const since = row.state === "RETAKE_READY" ? (c.bookableFrom ?? row.last?.recordedAt ?? c.eligibleAt) : c.eligibleAt;
      const waiting = daysBetween(since, now);
      return {
        main: waiting >= 1 ? `Waiting ${fmtGap(now - since)}` : "Became bookable today",
        sub: c.lastNudgedAt ? `Reminded ${fmtDay(c.lastNudgedAt)}` : row.last ? `Last: ${OUTCOME_LABEL[row.last.outcome ?? ""]}` : "Never reminded",
        alert: waiting >= 7,
      };
    }
    case "BOOKED":
    case "IN_PROGRESS":
      return { main: fmtDayTime(row.live!.startsAt), sub: `with ${row.live!.interviewer}` };
    case "AWAITING_RESULT":
      return { main: `Interviewed ${fmtDayTime(row.live!.startsAt)}`, sub: `${row.live!.interviewer} · ${row.outcomeOverdue ? "outcome overdue" : "outcome due"}`, alert: row.outcomeOverdue };
    case "PASSED":
      return { main: `Badge awarded ${fmtDay(c.awardedAt ?? now)}`, sub: row.last ? `by ${row.last.interviewer}` : undefined };
    case "COOLDOWN":
      return { main: `${OUTCOME_LABEL[c.lastOutcome ?? ""]} · can rebook ${fmtDay(c.bookableFrom ?? now)}`, sub: row.last ? `by ${row.last.interviewer}` : undefined };
    case "BLOCKED":
    case "NULLIFIED":
      return { main: c.flagReason ?? "Flagged", sub: c.flaggedAt ? `Flagged ${fmtDay(c.flaggedAt)}` : undefined, alert: true };
    default:
      return { main: "" };
  }
}

export default async function TeamDashboard({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const user = await requireRole("admin");
  const now = await getNow();
  const { view: viewParam } = await searchParams;
  const [rows, insights] = await Promise.all([getPipeline(now), getTeamInsights(now, startOfDay(now))]);
  const events = await getEventsFor(rows.map((r) => r.candidacy.id));

  const view = VIEWS.find((v) => v.key === viewParam) ?? VIEWS[0];
  const inView = (v: (typeof VIEWS)[number]) => rows.filter((r) => v.states === null || (v.states as readonly JourneyState[]).includes(r.state));
  const shown = inView(view).sort((a, b) => {
    if (view.key === "waiting") return a.candidacy.eligibleAt - b.candidacy.eligibleAt; // longest wait first
    return (a.live?.startsAt ?? a.last?.startsAt ?? a.candidacy.eligibleAt) - (b.live?.startsAt ?? b.last?.startsAt ?? b.candidacy.eligibleAt);
  });
  const items: PipelineItem[] = shown.map((row) => {
    const d = detail(row, now);
    return {
      candidacyId: row.candidacy.id,
      name: row.student.name,
      campus: row.student.campus ?? "",
      badge: `${row.badge.tier} · ${row.badge.track}`,
      state: row.state,
      ...d,
      attempts: row.candidacy.attemptCount,
      canNudge: row.state === "ELIGIBLE" || row.state === "RETAKE_READY",
      flagged: row.state === "BLOCKED" || row.state === "NULLIFIED",
      hasBadge: row.state === "PASSED" || row.candidacy.statusBeforeFlag === "passed",
      roomHref: row.live ? `/interviewer/interview/${row.live.id}` : null,
      events: events.filter((e) => e.candidacyId === row.candidacy.id).map((e) => ({ id: e.id, summary: e.summary, createdAt: e.createdAt })),
    };
  });

  const waiting = inView(VIEWS[0]).length;
  const openNext7 = insights.capacity.slice(0, 7).reduce((n, d) => n + d.open, 0);
  const overdue = rows.filter((r) => r.outcomeOverdue).length;
  const daysLeft = Math.max(0, daysBetween(now, POLICY.qualifierDeadline));
  const short = openNext7 < waiting;
  const flagged = insights.people.filter((p) => p.calibration === "lenient" || p.calibration === "strict");

  return (
    <AppShell user={user} active="/team">
      <LiveRefresh every={15000} />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow className="text-gold">Interview team</Eyebrow>
          <h1 className="mt-2 font-display text-3xl sm:text-4xl">Where every interview stands</h1>
          <p className="mt-2 max-w-2xl text-muted">Who is waiting, whether there are enough slots for them, and whether every interviewer is holding the same bar.</p>
        </div>
      </div>

      <dl className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Eligible, not booked" value={waiting} hint="Each one is a badge waiting on a 30-minute call" tone={waiting ? "gold" : undefined} />
        <Stat
          label="Open slots, next 7 days"
          value={openNext7}
          hint={short ? "Fewer than students waiting. Ask interviewers for more time." : `Enough for the ${waiting} waiting`}
          tone={short ? "danger" : undefined}
        />
        <Stat label="Outcomes overdue" value={overdue} hint={`Interview done, no result after ${POLICY.outcomeSlaHours} h`} tone={overdue ? "danger" : undefined} />
        <Stat label="Days to Qualifier cut-off" value={daysLeft} hint="Badge needed by 31 Dec 2026" />
      </dl>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Card className="p-5 sm:p-6">
          <h2 className="text-lg font-semibold">Funnel</h2>
          <p className="text-sm text-muted">From clearing the skills to holding the badge, across every candidate.</p>
          <div className="mt-6">
            <Funnel steps={insights.funnel} />
          </div>
        </Card>
        <Card className="p-5 sm:p-6">
          <h2 className="text-lg font-semibold">Capacity, next 10 days</h2>
          <p className="text-sm text-muted">Slots students can still book (from {POLICY.minNoticeHours} h ahead) against those already taken.</p>
          <div className="mt-5">
            <CapacityChart days={insights.capacity} now={now} />
          </div>
        </Card>
      </div>

      <Card className="mt-6 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Interviewers and calibration</h2>
            <p className="text-sm text-muted">Same rubric, same bar. A badge shouldn&apos;t depend on who took the slot.</p>
          </div>
          {flagged.length > 0 && (
            <p className="rounded-xl bg-warning-soft px-3 py-2 text-sm font-medium text-warning">
              {flagged.map((p) => p.name.split(" ")[0]).join(" and ")} {flagged.length === 1 ? "is" : "are"} outside the team&apos;s range. Worth a scorecard review.
            </p>
          )}
        </div>
        <div className="mt-5">
          <CalibrationTable people={insights.people} teamRate={insights.teamRate} />
        </div>
      </Card>

      <section className="mt-10" aria-labelledby="pipeline-title">
        <h2 id="pipeline-title" className="font-display text-2xl">
          Students
        </h2>
        <nav aria-label="Pipeline views" className="mt-4 flex flex-wrap gap-2">
          {VIEWS.map((v) => {
            const active = v.key === view.key;
            return (
              <Link
                key={v.key}
                href={`/team?view=${v.key}`}
                scroll={false}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-10 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors",
                  active ? "border-ink bg-ink text-white" : "border-line bg-surface text-muted hover:border-ink/30 hover:text-ink",
                )}
              >
                {v.label}
                <span className={cn("rounded-full px-1.5 text-xs tabular-nums", active ? "bg-white/20" : "bg-sunken")}>{inView(v).length}</span>
              </Link>
            );
          })}
        </nav>
        <div className="mt-4">
          <PipelineList items={items} emptyText={view.empty} />
        </div>
      </section>
      <p className="mt-4 text-xs text-muted">Updated live. Times in IST. Waiting longer than 7 days is shown in red; reminders are limited to one a day per student ({fmtGap(POLICY.nudgeGapHours * MS.HOUR)}).</p>
    </AppShell>
  );
}
