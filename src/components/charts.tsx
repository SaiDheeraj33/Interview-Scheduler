/**
 * Team charts, built from plain HTML so they render on the server and stay accessible.
 * Mark specs follow the dataviz method: bars at most 24px, 4px rounded data end, 2px
 * surface gap between stacked segments, hairline recessive grid, legend for two
 * series, a hover/focus tooltip on every mark, and a table view of the same numbers.
 * Series colours (--color-series-1/2) were validated for colour-vision deficiency.
 */
import { Scale, TriangleAlert } from "lucide-react";
import { POLICY } from "@/domain/policy";
import { fmtDayNum, fmtWeekday } from "@/lib/time";
import type { InterviewerInsight } from "@/server/queries";
import { Avatar, cn } from "./ui";

/* ------------------------------------------------------------------ funnel */

export function Funnel({ steps }: { steps: { label: string; value: number; hint: string }[] }) {
  const max = Math.max(1, ...steps.map((s) => s.value));
  return (
    <ol className="space-y-4">
      {steps.map((s, i) => {
        const prev = steps[i - 1];
        const rate = prev && prev.value ? Math.round((s.value / prev.value) * 100) : null;
        return (
          <li key={s.label}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-semibold">{s.label}</span>
              <span className="text-xs text-muted">{rate !== null ? `${rate}% of previous step` : s.hint}</span>
            </div>
            <div className="mt-1.5 flex items-center gap-3">
              <div className="h-6 flex-1">
                <div
                  className="group relative h-6 rounded-r-[4px] bg-series-1"
                  style={{ width: `${Math.max(2, (s.value / max) * 100)}%` }}
                  tabIndex={0}
                  aria-label={`${s.label}: ${s.value}. ${s.hint}`}
                >
                  <span role="tooltip" className="pointer-events-none absolute -top-9 left-2 z-10 hidden whitespace-nowrap rounded-lg bg-ink px-2.5 py-1 text-xs text-white shadow-float group-hover:block group-focus:block">
                    {s.value} · {s.hint}
                  </span>
                </div>
              </div>
              <span className="w-10 text-right text-lg font-semibold tabular-nums">{s.value}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* ---------------------------------------------------------------- capacity */

const niceMax = (n: number) => {
  if (n <= 5) return 5;
  const step = n <= 20 ? 5 : n <= 50 ? 10 : 20;
  return Math.ceil(n / step) * step;
};

export function CapacityChart({ days, now }: { days: { dayStart: number; booked: number; open: number }[]; now: number }) {
  const max = niceMax(Math.max(...days.map((d) => d.booked + d.open)));
  const H = 168;
  const ticks = [0, max / 2, max];
  return (
    <figure>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted" aria-hidden>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-series-1" /> Booked
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-series-2" /> Open, not yet booked
        </span>
      </div>
      <div className="mt-6 flex gap-2">
        <div className="relative w-6 shrink-0 text-right text-[11px] tabular-nums text-faint" style={{ height: H }} aria-hidden>
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ bottom: (t / max) * H - 6 }}>
              {t}
            </span>
          ))}
        </div>
        <div className="relative flex-1">
          {ticks.map((t) => (
            <span key={t} aria-hidden className="absolute inset-x-0 h-px bg-line" style={{ bottom: (t / max) * H }} />
          ))}
          <ol className="relative grid grid-cols-10" style={{ height: H }} aria-label="Interview slots per day, next 10 days">
            {days.map((d) => {
              const total = d.booked + d.open;
              const bookedH = (d.booked / max) * H;
              const openH = (d.open / max) * H;
              const isToday = d.dayStart <= now && now < d.dayStart + 86_400_000;
              return (
                <li key={d.dayStart} className="group relative flex h-full flex-col items-center justify-end outline-none" tabIndex={0} aria-label={`${fmtWeekday(d.dayStart)} ${fmtDayNum(d.dayStart)}: ${d.booked} booked, ${d.open} open`}>
                  <span
                    role="tooltip"
                    className="pointer-events-none absolute z-10 hidden whitespace-nowrap rounded-lg bg-ink px-2.5 py-1.5 text-xs text-white shadow-float group-hover:block group-focus:block"
                    style={{ bottom: Math.max(bookedH + openH, 8) + 8 }}
                  >
                    <span className="font-semibold">
                      {fmtWeekday(d.dayStart)} {fmtDayNum(d.dayStart)}
                    </span>
                    <br />
                    {d.booked} booked · {d.open} open
                  </span>
                  {total === 0 ? (
                    <span className="mb-0 h-0.5 w-5 rounded-full bg-line-strong" aria-hidden />
                  ) : (
                    <span className="flex w-full max-w-6 flex-col gap-0.5" aria-hidden>
                      {d.open > 0 && <span className={cn("w-full bg-series-2", "rounded-t-[4px]")} style={{ height: Math.max(openH - (d.booked ? 1 : 0), 2) }} />}
                      {d.booked > 0 && <span className={cn("w-full bg-series-1", d.open === 0 && "rounded-t-[4px]")} style={{ height: Math.max(bookedH - (d.open ? 1 : 0), 2) }} />}
                    </span>
                  )}
                  <span className={cn("absolute -bottom-9 text-center text-[11px] leading-tight", isToday ? "font-semibold text-ink" : "text-muted")}>
                    {isToday ? "Today" : fmtWeekday(d.dayStart)}
                    <br />
                    <span className="tabular-nums">{fmtDayNum(d.dayStart)}</span>
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
      <details className="mt-12 text-sm">
        <summary className="text-xs font-semibold text-muted hover:text-ink">Show as a table</summary>
        <table className="mt-2 w-full text-left text-sm tabular-nums">
          <thead className="text-xs text-muted">
            <tr>
              <th className="py-1 font-semibold">Day</th>
              <th className="py-1 font-semibold">Booked</th>
              <th className="py-1 font-semibold">Open</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {days.map((d) => (
              <tr key={d.dayStart}>
                <td className="py-1">
                  {fmtWeekday(d.dayStart)} {fmtDayNum(d.dayStart)}
                </td>
                <td className="py-1">{d.booked}</td>
                <td className="py-1">{d.open}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

/* ------------------------------------------------------------- calibration */

const pct = (n: number | null) => (n === null ? "–" : `${Math.round(n * 100)}%`);

const CALIBRATION = {
  lenient: { label: "Passes more than the team", tone: "text-warning bg-warning-soft ring-warning/20", Icon: TriangleAlert },
  strict: { label: "Passes fewer than the team", tone: "text-warning bg-warning-soft ring-warning/20", Icon: TriangleAlert },
  in_line: { label: "In line with the team", tone: "text-success bg-success-soft ring-success/20", Icon: Scale },
  too_few: { label: "Too few to judge", tone: "text-muted bg-sunken ring-line", Icon: Scale },
} as const;

export function CalibrationTable({ people, teamRate }: { people: InterviewerInsight[]; teamRate: number | null }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[46rem] text-left text-sm">
        <thead>
          <tr className="border-b border-line text-xs text-muted">
            <th className="py-2 pr-4 font-semibold">Interviewer</th>
            <th className="py-2 pr-4 font-semibold">Pass rate · team {pct(teamRate)}</th>
            <th className="py-2 pr-4 font-semibold">Avg score</th>
            <th className="py-2 pr-4 font-semibold" title="Outcome differed from the rubric's suggestion">
              Overrides
            </th>
            <th className="py-2 pr-4 font-semibold">Upcoming</th>
            <th className="py-2 pr-4 font-semibold">Open, 7 days</th>
            <th className="py-2 font-semibold">Outcomes due</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {people.map((p) => {
            const cal = CALIBRATION[p.calibration];
            return (
              <tr key={p.id} className="align-middle">
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-3">
                    <Avatar name={p.name} size="sm" />
                    <div>
                      <p className="font-semibold">{p.name}</p>
                      <p className={cn("mt-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1", cal.tone)}>
                        <cal.Icon aria-hidden className="size-3" /> {cal.label}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-3">
                    <div className="relative h-2 w-28 rounded-full bg-sunken" aria-hidden>
                      {p.passRate !== null && <div className="h-2 rounded-full bg-series-1" style={{ width: `${p.passRate * 100}%` }} />}
                      {teamRate !== null && <span className="absolute -top-1 h-4 w-0.5 rounded-full bg-ink" style={{ left: `calc(${teamRate * 100}% - 1px)` }} title="Team pass rate" />}
                    </div>
                    <span className="font-semibold tabular-nums">{pct(p.passRate)}</span>
                    <span className="text-xs text-muted tabular-nums">
                      {p.passed}/{p.decided}
                    </span>
                  </div>
                </td>
                <td className="py-3 pr-4 font-semibold tabular-nums">{p.avgScore === null ? "–" : p.avgScore.toFixed(2)}</td>
                <td className={cn("py-3 pr-4 tabular-nums", p.overrides > 0 && "font-semibold text-warning")}>{p.overrides}</td>
                <td className="py-3 pr-4 tabular-nums">{p.upcoming}</td>
                <td className={cn("py-3 pr-4 tabular-nums", p.openNext7 === 0 && "font-semibold text-danger")}>{p.openNext7}</td>
                <td className="py-3 tabular-nums">
                  {p.pendingOutcome}
                  {p.overdue > 0 && <span className="ml-1.5 rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-semibold text-danger">{p.overdue} overdue</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-muted">
        Flagged when a pass rate is {POLICY.calibrationGapPoints} points or more from the team&apos;s, over at least {POLICY.calibrationMinSample} decided interviews. A flag is a prompt
        to review scorecards together, not a verdict. The black tick marks the team rate.
      </p>
    </div>
  );
}
