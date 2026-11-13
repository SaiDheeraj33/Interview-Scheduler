import { CalendarPlus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { JourneyCard, LeaderboardRow, StandingStrip } from "@/components/journey";
import { AppShell } from "@/components/shell";
import { buttonClass, cn, PageHeader, StateChip } from "@/components/ui";
import type { JourneyState, Outcome } from "@/domain/journey";
import { MS, POLICY } from "@/domain/policy";
import { journeyCopy, type JourneyContext } from "@/lib/messages";
import { getSession } from "@/server/session";

export const metadata: Metadata = { title: "Before & after" };
export const dynamic = "force-dynamic";

/**
 * The same components the live dashboard uses, fed with fixed example data,
 * so the effect of a result can be compared side by side.
 */
const BADGE = { track: "AI Product Mastery", tier: "Novice", bonusMiles: 500 };
const STUDENT = { name: "Ananya Iyer", campus: "Chennai", miles: 2035 };
const INTERVIEWER = "Priya Krishnan";
const REQUIREMENTS = [
  { skill: "Computational Thinking", level: 1, cleared: true },
  { skill: "CS Fundamentals", level: 1, cleared: true },
  { skill: "Applied Gen AI Development", level: 1, cleared: true },
  { skill: "UI Engineering", level: 2, cleared: true },
];
const FAIL_FEEDBACK = "Your Gen AI project works, but you couldn't explain how the prompt chain handles bad inputs. Revise error handling and be ready to walk through your own code line by line.";
const RETAKE_FEEDBACK = "Your connection dropped twice and we lost 15 minutes, so I couldn't cover the UI Engineering section. Please rebook from a stable network.";

const SCENARIOS = {
  pass: { label: "Pass", before: "AWAITING_RESULT", after: "PASSED", outcome: "pass", feedback: null, summary: "The badge appears, 500 bonus Miles are added, and the student moves up the leaderboard and into the Qualifier." },
  fail: { label: "Fail", before: "AWAITING_RESULT", after: "COOLDOWN", outcome: "fail", feedback: FAIL_FEEDBACK, summary: "Nothing is taken away. The student gets the interviewer's feedback and a date they can book again." },
  retake: { label: "Retake later", before: "AWAITING_RESULT", after: "RETAKE_READY", outcome: "retake", feedback: RETAKE_FEEDBACK, summary: "The attempt is not counted. The student can book a new slot straight away." },
  nullified: { label: "Flagged after passing", before: "PASSED", after: "NULLIFIED", outcome: "pass", feedback: null, summary: "A malpractice flag after the badge was earned removes the badge and its bonus Miles, and the leaderboard position falls back." },
} as const satisfies Record<string, { label: string; before: JourneyState; after: JourneyState; outcome: Outcome; feedback: string | null; summary: string }>;
type ScenarioKey = keyof typeof SCENARIOS;

function Column({ label, tone, children }: { label: string; tone: "before" | "after"; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className={cn("mb-2 inline-block rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide", tone === "before" ? "bg-sunken text-muted" : "bg-primary text-on-primary")}>{label}</p>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Section({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted">{note}</p>
      <div className="mt-4 grid gap-6 lg:grid-cols-2">{children}</div>
    </section>
  );
}

export default async function BeforeAfter({ searchParams }: { searchParams: Promise<{ result?: string }> }) {
  const user = await getSession();
  const { result } = await searchParams;
  const key: ScenarioKey = result && result in SCENARIOS ? (result as ScenarioKey) : "pass";
  const sc = SCENARIOS[key];
  const now = Date.now();
  const interviewAt = now - 2 * MS.HOUR;

  const ctx = (state: JourneyState): JourneyContext => ({
    badge: BADGE,
    now,
    progress: { cleared: 4, total: 4 },
    booking: state === "AWAITING_RESULT" ? { startsAt: interviewAt, endsAt: interviewAt + POLICY.slotMinutes * MS.MINUTE, interviewer: INTERVIEWER } : null,
    lastOutcome: sc.outcome,
    lastFeedback: sc.feedback,
    lastStartsAt: interviewAt,
    bookableFrom: state === "COOLDOWN" ? now + POLICY.failCooldownDays * MS.DAY : null,
  });

  const held = (state: JourneyState) => state === "PASSED";
  const standing = (state: JourneyState) => ({ miles: STUDENT.miles + (held(state) ? BADGE.bonusMiles : 0), badgesHeld: held(state) ? 1 : 0, rank: held(state) ? 2 : 6, of: 14 });
  const homeFor = (state: JourneyState) => (
    <>
      <StandingStrip {...standing(state)} />
      <JourneyCard
        badge={BADGE}
        state={state}
        copy={journeyCopy(state, ctx(state))}
        requirements={REQUIREMENTS}
        attemptCount={state === "COOLDOWN" ? 1 : 0}
        actions={
          state === "RETAKE_READY" ? (
            <span className={buttonClass("primary")}>
              <CalendarPlus aria-hidden className="size-4" /> Book a new slot
            </span>
          ) : null
        }
      />
    </>
  );
  const board = (state: JourneyState) => {
    const me = { rank: standing(state).rank, name: STUDENT.name, campus: STUDENT.campus, miles: standing(state).miles, badge: held(state) ? "Novice" : null, highlight: true };
    const others = [
      { rank: 1, name: "Rohan Verma", campus: "Hyderabad", miles: 2890, badge: "Novice" },
      { rank: held(state) ? 3 : 2, name: "Kabir Mehta", campus: "Pune", miles: 2260, badge: null },
      { rank: held(state) ? 4 : 3, name: "Diya Reddy", campus: "Hyderabad", miles: 2110, badge: null },
    ];
    const rows = [...others, me].sort((a, b) => a.rank - b.rank).slice(0, held(state) ? 3 : 4);
    return (
      <div className="space-y-2">
        {rows.map((r) => (
          <LeaderboardRow key={r.name} {...r} />
        ))}
        {!held(state) && <p className="px-1 text-xs text-muted">Ranks 4 and 5 hidden. Without a Track Badge, {STUDENT.name.split(" ")[0]} is not in the Qualifier.</p>}
      </div>
    );
  };
  const teamRow = (state: JourneyState, text: string) => (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{STUDENT.name}</p>
        <p className="text-sm text-muted">{text}</p>
      </div>
      <StateChip state={state} />
    </div>
  );
  const teamText: Record<JourneyState, string> = {
    AWAITING_RESULT: `Interviewed today · ${INTERVIEWER} · outcome due`,
    PASSED: `Badge awarded today by ${INTERVIEWER}`,
    COOLDOWN: `Failed · can rebook in ${POLICY.failCooldownDays} days · Attempts: 1`,
    RETAKE_READY: "Retake later · back in “Eligible, not booked”",
    NULLIFIED: "Flagged today · badge nullified, Miles reversed",
    NOT_ELIGIBLE: "",
    ELIGIBLE: "",
    BOOKED: "",
    IN_PROGRESS: "",
    BLOCKED: "",
  };

  return (
    <AppShell user={user}>
      <PageHeader
        eyebrow="Before & after"
        title="What a result changes"
        lead="The same screens, before and after the interviewer records an outcome. Pick a result to compare. These are the live components with example data."
      />

      <nav aria-label="Result to compare" className="mt-6 flex flex-wrap gap-2">
        {(Object.keys(SCENARIOS) as ScenarioKey[]).map((k) => (
          <Link
            key={k}
            href={`/before-after?result=${k}`}
            scroll={false}
            aria-current={k === key ? "page" : undefined}
            className={cn(
              "flex min-h-10 items-center rounded-full border px-4 text-sm font-semibold transition-colors",
              k === key ? "border-primary bg-primary text-on-primary" : "border-line bg-surface text-muted hover:border-primary hover:text-primary",
            )}
          >
            {SCENARIOS[k].label}
          </Link>
        ))}
      </nav>
      <p className="mt-4 max-w-2xl rounded-xl border border-line bg-surface px-4 py-3 text-sm">{sc.summary}</p>

      <Section title="Student home" note="The first thing a student sees after signing in: their standing, then the journey card for the badge.">
        <Column label={key === "nullified" ? "Before the flag" : "Before the result"} tone="before">
          {homeFor(sc.before)}
        </Column>
        <Column label={key === "nullified" ? "After the flag" : `After: ${sc.label}`} tone="after">
          {homeFor(sc.after)}
        </Column>
      </Section>

      <Section title="Leaderboard" note="Miles decide the rank, and a Track Badge decides who is in the Qualifier. Both move only when a badge is held.">
        <Column label="Before" tone="before">
          {board(sc.before)}
        </Column>
        <Column label="After" tone="after">
          {board(sc.after)}
        </Column>
      </Section>

      <Section title="Interview team pipeline" note="The team's row for the same student, so nobody has to ask what happened.">
        <Column label="Before" tone="before">
          {teamRow(sc.before, teamText[sc.before])}
        </Column>
        <Column label="After" tone="after">
          {teamRow(sc.after, teamText[sc.after])}
        </Column>
      </Section>
    </AppShell>
  );
}
