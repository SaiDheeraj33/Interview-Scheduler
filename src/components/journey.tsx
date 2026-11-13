/**
 * The pieces of the student experience that change when an interview result lands.
 * They are pure (props in, markup out) so the live dashboard and the before/after
 * page render exactly the same components.
 */
import { Award, Ban, Check, CircleCheck, CircleDashed, Lock, Trophy } from "lucide-react";
import type { JourneyState } from "@/domain/journey";
import type { BadgeRef, JourneyCopy } from "@/lib/messages";
import { fmtDayTime } from "@/lib/time";
import { Card, cn, StateChip, TONE } from "./ui";

const STEPS = ["Skills", "Book", "Interview", "Result", "Badge"] as const;

/** How many steps are complete, and whether the journey is stopped. */
function progress(state: JourneyState): { done: number; halted: boolean } {
  switch (state) {
    case "NOT_ELIGIBLE":
      return { done: 0, halted: false };
    case "ELIGIBLE":
    case "RETAKE_READY":
    case "COOLDOWN":
      return { done: 1, halted: false };
    case "BOOKED":
    case "IN_PROGRESS":
      return { done: 2, halted: false };
    case "AWAITING_RESULT":
      return { done: 3, halted: false };
    case "PASSED":
      return { done: 5, halted: false };
    case "BLOCKED":
      return { done: 1, halted: true };
    case "NULLIFIED":
      return { done: 4, halted: true };
  }
}

function Stepper({ state }: { state: JourneyState }) {
  const { done, halted } = progress(state);
  return (
    <ol className="grid grid-cols-5 gap-1.5" aria-label="Interview journey progress">
      {STEPS.map((label, i) => {
        const status = i < done ? "done" : i === done ? (halted ? "halted" : "current") : "todo";
        return (
          <li key={label} aria-current={status === "current" ? "step" : undefined}>
            <span
              className={cn(
                "block h-1.5 rounded-full",
                status === "done" && "bg-primary",
                status === "current" && "bg-primary/35",
                status === "halted" && "bg-danger",
                status === "todo" && "bg-line",
              )}
            />
            <span className={cn("mt-2 flex items-center gap-1 text-xs font-medium", status === "todo" ? "text-faint" : "text-ink")}>
              {status === "done" && <Check aria-hidden className="size-3.5 text-primary" />}
              {status === "halted" && <Ban aria-hidden className="size-3.5 text-danger" />}
              {status === "current" && <span aria-hidden className="animate-pulse-dot size-1.5 rounded-full bg-primary" />}
              {label}
              <span className="sr-only">{status === "done" ? ", complete" : status === "current" ? ", current step" : status === "halted" ? ", stopped" : ", not started"}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** The badge itself. Earned: a gold-ringed medal (it animates in once, unless reduced motion is on). */
export function BadgeGlyph({ state, size = "md", celebrate = false }: { state: JourneyState; size?: "md" | "lg"; celebrate?: boolean }) {
  const box = size === "lg" ? "size-20" : "size-14";
  const icon = size === "lg" ? "size-9" : "size-6";
  if (state === "PASSED")
    return (
      <span className={cn("relative isolate flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-ink text-[#e9c46a] ring-4 ring-[#e9c46a]/70 ring-offset-2 ring-offset-surface", box, celebrate && "animate-medal")}>
        <Award aria-hidden className={icon} />
        {celebrate && <span aria-hidden className="animate-shine absolute inset-y-0 left-0 w-1/3 bg-white/25" />}
      </span>
    );
  if (state === "NULLIFIED")
    return (
      <span className={cn("flex shrink-0 items-center justify-center rounded-full border-2 border-dashed border-danger/50 bg-danger-soft text-danger", box)}>
        <Ban aria-hidden className={icon} />
      </span>
    );
  return (
    <span className={cn("flex shrink-0 items-center justify-center rounded-full border-2 border-dashed border-line-strong bg-sunken text-faint", box)}>
      <Lock aria-hidden className={icon} />
    </span>
  );
}

export interface JourneyCardProps {
  badge: BadgeRef;
  state: JourneyState;
  copy: JourneyCopy;
  requirements?: { skill: string; level: number; cleared: boolean }[];
  events?: { id: string; summary: string; createdAt: number }[];
  attemptCount?: number;
  actions?: React.ReactNode;
  /** A state-specific feature block: the countdown, the rebook timer. */
  feature?: React.ReactNode;
  /** The first card on the dashboard is larger. */
  hero?: boolean;
  /** Animate the medal when the badge is earned. Defaults to the hero card. */
  celebrate?: boolean;
}

export function JourneyCard({ badge, state, copy, requirements, events, attemptCount = 0, actions, feature, hero = false, celebrate = hero }: JourneyCardProps) {
  const tone = TONE[copy.tone];
  return (
    <Card as="article" className="overflow-hidden">
      <div className={cn("relative border-b px-5 pb-6 pt-5 sm:px-7 sm:pt-6", tone.panel)}>
        <div className="flex items-start gap-4">
          <BadgeGlyph state={state} size={hero ? "lg" : "md"} celebrate={state === "PASSED" && celebrate} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-muted">
                {badge.track} · <span className={cn(state === "NULLIFIED" && "line-through decoration-danger/60")}>{badge.tier} badge</span>
              </p>
              <StateChip state={state} />
            </div>
            <p className={cn("mt-3 text-xs font-bold uppercase tracking-[0.14em]", tone.accent)}>{copy.eyebrow}</p>
            <h2 className={cn("mt-1 font-display leading-tight", hero ? "text-2xl sm:text-[2rem]" : "text-xl sm:text-2xl")}>{copy.title}</h2>
          </div>
        </div>
        <p className="mt-4 max-w-prose text-[15px] leading-relaxed text-ink/85">{copy.body}</p>
        {feature && <div className="mt-5">{feature}</div>}
        {actions && <div className="mt-5 flex flex-wrap items-center gap-2">{actions}</div>}
        {attemptCount > 0 && state !== "PASSED" && state !== "NULLIFIED" && <p className="mt-4 text-xs font-medium text-muted">Attempts so far: {attemptCount}</p>}
      </div>

      <div className="px-5 py-5 sm:px-7">
        <Stepper state={state} />
      </div>

      {(!!requirements?.length || !!events?.length) && (
        <div className="grid gap-x-10 gap-y-6 border-t border-line px-5 py-5 sm:grid-cols-2 sm:px-7 sm:py-6">
          {!!requirements?.length && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">What this badge needs</h3>
              <ul className="mt-3 space-y-2 text-sm">
                {requirements.map((r) => (
                  <li key={r.skill} className="flex items-center gap-2.5">
                    {r.cleared ? <CircleCheck aria-hidden className="size-4 shrink-0 text-success" /> : <CircleDashed aria-hidden className="size-4 shrink-0 text-faint" />}
                    <span className={r.cleared ? "" : "text-muted"}>
                      {r.skill} <span className="font-semibold">L{r.level}</span>
                      <span className="sr-only">{r.cleared ? " cleared" : " pending"}</span>
                    </span>
                  </li>
                ))}
                <li className="flex items-center gap-2.5">
                  {state === "PASSED" ? <CircleCheck aria-hidden className="size-4 shrink-0 text-success" /> : <CircleDashed aria-hidden className="size-4 shrink-0 text-faint" />}
                  <span className={state === "PASSED" ? "" : "text-muted"}>Level Clearance Interview</span>
                </li>
              </ul>
            </div>
          )}
          {!!events?.length && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">History</h3>
              <ol className="mt-3 space-y-3 border-l border-line pl-4 text-sm">
                {events.slice(0, 5).map((e) => (
                  <li key={e.id} className="relative">
                    <span className="absolute -left-[21px] top-1.5 size-2.5 rounded-full border-2 border-surface bg-primary/60" aria-hidden />
                    {e.summary}
                    <span className="block text-xs text-muted">{fmtDayTime(e.createdAt)}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

/** Miles, badges and rank: the numbers a result moves. */
export function StandingStrip({ miles, badgesHeld, rank, of, stacked = false }: { miles: number; badgesHeld: number; rank: number; of: number; stacked?: boolean }) {
  const items = [
    { label: "Miles", value: miles.toLocaleString("en-IN"), hint: "Contests + badge bonus" },
    { label: "Track badges", value: String(badgesHeld), hint: badgesHeld > 0 ? "Qualifier: you're in" : "1 needed for the Qualifier" },
    { label: "Leaderboard", value: rank ? `#${rank}` : "–", hint: of ? `of ${of} students` : "" },
  ];
  return (
    <dl className={cn("grid gap-px overflow-hidden rounded-(--radius-card) border border-line bg-line shadow-card", stacked ? "grid-cols-3 lg:grid-cols-1" : "grid-cols-3")}>
      {items.map((item) => (
        <div key={item.label} className="bg-surface px-4 py-4 sm:px-5">
          <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{item.label}</dt>
          <dd className="mt-1 text-2xl font-semibold tabular-nums tracking-tight sm:text-3xl">{item.value}</dd>
          <p className={cn("mt-0.5 text-xs", item.label === "Track badges" && badgesHeld > 0 ? "font-semibold text-success" : "text-muted")}>{item.hint}</p>
        </div>
      ))}
    </dl>
  );
}

export function LeaderboardRow({ rank, name, campus, miles, badge, highlight }: { rank: number; name: string; campus: string; miles: number; badge: string | null; highlight?: boolean }) {
  return (
    <div className={cn("flex items-center gap-3 rounded-2xl border px-4 py-3", highlight ? "border-primary/30 bg-primary-soft" : "border-line bg-surface")}>
      <span className="w-8 font-display text-xl tabular-nums text-muted">{rank}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{name}</p>
        <p className="text-xs text-muted">{campus}</p>
      </div>
      {badge ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-ink px-2.5 py-1 text-xs font-semibold text-[#e9c46a]">
          <Trophy aria-hidden className="size-3.5" />
          {badge}
        </span>
      ) : (
        <span className="rounded-full bg-sunken px-2.5 py-1 text-xs font-semibold text-muted">No badge yet</span>
      )}
      <span className="w-16 text-right font-semibold tabular-nums">{miles.toLocaleString("en-IN")}</span>
    </div>
  );
}
