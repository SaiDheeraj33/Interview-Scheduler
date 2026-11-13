import { ArrowRight, CalendarCheck2, CircleCheck, ClipboardCheck, Clock3, GraduationCap, LayoutDashboard, MonitorPlay, RotateCcw, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/shell";
import { Avatar, buttonClass, cn, Eyebrow, StateChip } from "@/components/ui";
import type { JourneyState } from "@/domain/journey";
import { resetDemo, signInAs } from "@/server/actions";
import { getNow } from "@/server/clock";
import { getPersonas } from "@/server/queries";

export const dynamic = "force-dynamic";

function PersonaButton({ id, name, sub, right, chip }: { id: string; name: string; sub?: string | null; right?: React.ReactNode; chip?: React.ReactNode }) {
  return (
    <form action={signInAs}>
      <input type="hidden" name="userId" value={id} />
      <button
        type="submit"
        className="group flex min-h-14 w-full items-center gap-3 rounded-2xl border border-line bg-surface px-3 py-2.5 text-left transition-[border-color,box-shadow] hover:border-primary/50 hover:shadow-card"
      >
        <Avatar name={name} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{name}</span>
          {sub && <span className="block truncate text-xs text-muted">{sub}</span>}
          {chip}
        </span>
        {right}
        <ArrowRight aria-hidden className="size-4 shrink-0 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
      </button>
    </form>
  );
}

const GROUPS: { label: string; states: JourneyState[] }[] = [
  { label: "Needs to book", states: ["ELIGIBLE", "RETAKE_READY"] },
  { label: "Interview booked or happening", states: ["BOOKED", "IN_PROGRESS", "AWAITING_RESULT"] },
  { label: "Result in", states: ["PASSED", "COOLDOWN"] },
  { label: "Edge cases", states: ["NULLIFIED", "BLOCKED", "NOT_ELIGIBLE"] },
];

const DECISIONS = [
  { Icon: Clock3, title: "States are derived, not stored", body: "Five stored statuses, ten visible states. Anything time-based is computed, so no background job can fall behind. Try the demo clock." },
  { Icon: ShieldCheck, title: "Double-booking is impossible", body: "Two partial unique indexes in the database, not just checks in the UI. Two students racing for one slot: exactly one wins." },
  { Icon: ClipboardCheck, title: "Same rubric for every interviewer", body: "Scores suggest the outcome; disagreeing needs a reason. The team sees each interviewer's pass rate against the team's." },
  { Icon: CalendarCheck2, title: "Students pick a time, not a person", body: "The least-loaded free interviewer is assigned, and a retake avoids the previous one. More open times, fairer second opinions." },
];

export default async function Home({ searchParams }: { searchParams: Promise<{ reset?: string }> }) {
  const now = await getNow();
  const [{ reset }, personas] = await Promise.all([searchParams, getPersonas(now)]);
  const students = personas.filter((p) => p.role === "student");
  const interviewers = personas.filter((p) => p.role === "interviewer");
  const admins = personas.filter((p) => p.role === "admin");
  const groups = GROUPS.map((g) => ({ ...g, people: students.filter((s) => s.state && g.states.includes(s.state)) })).filter((g) => g.people.length);

  return (
    <AppShell>
      <section className="grid items-end gap-8 lg:grid-cols-[1.25fr_1fr]">
        <div>
          <Eyebrow className="text-gold">GRIT 2026–27 · Level Clearance Interviews</Eyebrow>
          <h1 className="mt-4 font-display text-4xl leading-[1.08] sm:text-6xl">
            The last step to a Track Badge, <em className="text-gold">without the back-and-forth.</em>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted">
            Students book a 30-minute interview the moment they qualify. Interviewers run their day from one screen and score against one rubric. The team sees who is
            stuck, and why.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/live" className={buttonClass("primary", "lg")}>
              <MonitorPlay aria-hidden className="size-5" /> Watch both sides live
            </Link>
            <Link href="/before-after" className={buttonClass("secondary", "lg")}>
              Before &amp; after a result
            </Link>
          </div>
        </div>
        <ol className="grid gap-px overflow-hidden rounded-(--radius-card) border border-line bg-line shadow-card" aria-label="How it works">
          {[
            ["Qualify", "Clear every skill level for a badge. The interview unlocks on its own."],
            ["Book", "Pick any open half hour in the next 14 days. Reschedule once."],
            ["Interview", "30 minutes online, scored on a shared rubric."],
            ["Badge", "Result on the dashboard in minutes, with feedback either way."],
          ].map(([t, d], i) => (
            <li key={t} className="flex gap-4 bg-surface px-5 py-4">
              <span className="font-display text-2xl leading-none text-gold tabular-nums">{i + 1}</span>
              <span>
                <span className="block font-semibold">{t}</span>
                <span className="block text-sm text-muted">{d}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      {reset && (
        <p role="status" className="mt-8 flex items-center gap-2 rounded-xl bg-success-soft px-4 py-3 text-sm font-medium text-success">
          <CircleCheck aria-hidden className="size-4" /> Demo data was reset and the clock is back to real time.
        </p>
      )}

      <section className="mt-16" aria-labelledby="personas">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Eyebrow className="text-gold">Choose a persona</Eyebrow>
            <h2 id="personas" className="mt-2 font-display text-3xl">Three people, three different products</h2>
          </div>
          <form action={resetDemo}>
            <button type="submit" className={buttonClass("ghost", "sm")}>
              <RotateCcw aria-hidden className="size-4" /> Reset demo data
            </button>
          </form>
        </div>

        <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <div data-persona="student" className="rounded-(--radius-card) border border-line bg-surface p-5 shadow-card sm:p-6">
            <div className="flex items-start gap-4">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                <GraduationCap aria-hidden className="size-5" />
              </span>
              <div>
                <h3 className="text-lg font-semibold">Student</h3>
                <p className="text-sm text-muted">Phone-first. One card that always says what happens next: book, join, wait, or celebrate.</p>
              </div>
            </div>
            <div className="mt-5 space-y-5">
              {groups.map((g) => (
                <div key={g.label}>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{g.label}</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {g.people.map((p) => (
                      <PersonaButton key={p.id} id={p.id} name={p.name} chip={p.state && <StateChip state={p.state} className="mt-1" />} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-5">
            <div data-persona="interviewer" className="rounded-(--radius-card) border border-line bg-surface p-5 shadow-card sm:p-6">
              <div className="flex items-start gap-4">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                  <ClipboardCheck aria-hidden className="size-5" />
                </span>
                <div>
                  <h3 className="text-lg font-semibold">Interviewer</h3>
                  <p className="text-sm text-muted">A calm day timeline, an interview room with the student&apos;s record and the rubric, and paint-to-set availability.</p>
                </div>
              </div>
              <div className="mt-5 grid gap-2">
                {interviewers.map((p) => (
                  <PersonaButton key={p.id} id={p.id} name={p.name} sub={p.id === "int-priya" ? "Busiest day: live and pending interviews" : "Interviewer"} />
                ))}
              </div>
            </div>
            <div data-persona="admin" className="rounded-(--radius-card) border border-line bg-surface p-5 shadow-card sm:p-6">
              <div className="flex items-start gap-4">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-gold-soft text-gold">
                  <LayoutDashboard aria-hidden className="size-5" />
                </span>
                <div>
                  <h3 className="text-lg font-semibold">Interview team lead</h3>
                  <p className="text-sm text-muted">Funnel, capacity against demand, interviewer calibration, and the list of who hasn&apos;t booked.</p>
                </div>
              </div>
              <div className="mt-5 grid gap-2">
                {admins.map((p) => (
                  <PersonaButton key={p.id} id={p.id} name={p.name} sub="Team lead" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-16" aria-labelledby="decisions">
        <Eyebrow className="text-gold">Decisions worth looking at</Eyebrow>
        <h2 id="decisions" className="mt-2 font-display text-3xl">What&apos;s under the surface</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {DECISIONS.map(({ Icon, title, body }) => (
            <div key={title} className={cn("rounded-(--radius-card) border border-line bg-surface p-5 shadow-card")}>
              <Icon aria-hidden className="size-5 text-gold" />
              <h3 className="mt-3 font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-muted">{body}</p>
            </div>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
