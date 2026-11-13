/** Small presentational building blocks. No data access, safe on server or client. */
import clsx from "clsx";
import { Ban, CalendarClock, CircleCheck, CircleDashed, Hourglass, Lock, RotateCcw, ShieldAlert, Sparkles, Video } from "lucide-react";
import type { JourneyState } from "@/domain/journey";
import { STATE_LABEL } from "@/domain/journey";
import type { Tone } from "@/lib/messages";

export const cn = clsx;

/** Buttons: 44px minimum touch target (36px for dense rows), one primary per view. */
export function buttonClass(variant: "primary" | "secondary" | "ghost" | "danger" | "gold" = "primary", size: "md" | "sm" | "lg" = "md") {
  return cn(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold transition-[background-color,border-color,color,box-shadow,transform] duration-150 active:translate-y-px disabled:pointer-events-none disabled:opacity-50",
    size === "lg" && "min-h-12 px-6 text-base",
    size === "md" && "min-h-11 px-5 text-[15px]",
    size === "sm" && "min-h-9 px-3 text-sm",
    variant === "primary" && "bg-primary text-on-primary shadow-[inset_0_1px_0_rgb(255_255_255/0.12)] hover:bg-primary-strong",
    variant === "gold" && "bg-gold text-white hover:bg-[#854d0e]",
    variant === "secondary" && "border border-line-strong bg-surface text-ink hover:border-ink/40",
    variant === "ghost" && "text-primary hover:bg-primary-soft",
    variant === "danger" && "border border-danger/35 bg-surface text-danger hover:bg-danger-soft",
  );
}

export const TONE: Record<Tone, { panel: string; accent: string; chip: string; dot: string }> = {
  action: { panel: "bg-primary-soft border-primary/20", accent: "text-primary", chip: "bg-primary-soft text-primary-strong ring-1 ring-primary/15", dot: "bg-primary" },
  info: { panel: "bg-info-soft border-info/15", accent: "text-info", chip: "bg-info-soft text-info ring-1 ring-info/15", dot: "bg-info" },
  success: { panel: "bg-success-soft border-success/20", accent: "text-success", chip: "bg-success-soft text-success ring-1 ring-success/15", dot: "bg-success" },
  warning: { panel: "bg-warning-soft border-warning/20", accent: "text-warning", chip: "bg-warning-soft text-warning ring-1 ring-warning/15", dot: "bg-warning" },
  danger: { panel: "bg-danger-soft border-danger/20", accent: "text-danger", chip: "bg-danger-soft text-danger ring-1 ring-danger/15", dot: "bg-danger" },
  neutral: { panel: "bg-sunken border-line", accent: "text-muted", chip: "bg-sunken text-muted ring-1 ring-line", dot: "bg-faint" },
};

export const STATE_STYLE: Record<JourneyState, { tone: Tone; Icon: typeof Lock }> = {
  NOT_ELIGIBLE: { tone: "neutral", Icon: Lock },
  ELIGIBLE: { tone: "action", Icon: Sparkles },
  BOOKED: { tone: "info", Icon: CalendarClock },
  IN_PROGRESS: { tone: "action", Icon: Video },
  AWAITING_RESULT: { tone: "info", Icon: CircleDashed },
  PASSED: { tone: "success", Icon: CircleCheck },
  COOLDOWN: { tone: "warning", Icon: Hourglass },
  RETAKE_READY: { tone: "action", Icon: RotateCcw },
  BLOCKED: { tone: "danger", Icon: ShieldAlert },
  NULLIFIED: { tone: "danger", Icon: Ban },
};

/** State is never shown by colour alone: every chip carries an icon and a label. */
export function StateChip({ state, className }: { state: JourneyState; className?: string }) {
  const { tone, Icon } = STATE_STYLE[state];
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold", TONE[tone].chip, className)}>
      <Icon aria-hidden className="size-3.5" />
      {STATE_LABEL[state]}
    </span>
  );
}

export function Chip({ tone = "neutral", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold", TONE[tone].chip, className)}>{children}</span>;
}

export function Card({ className, children, as: As = "section", ...rest }: React.HTMLAttributes<HTMLElement> & { as?: "section" | "article" | "div" | "aside" }) {
  return (
    <As className={cn("rounded-(--radius-card) border border-line bg-surface shadow-card", className)} {...rest}>
      {children}
    </As>
  );
}

export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("text-xs font-semibold uppercase tracking-[0.14em] text-primary", className)}>{children}</p>;
}

export function PageHeader({ eyebrow, title, lead, actions }: { eyebrow?: string; title: string; lead?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h1 className="mt-2 font-display text-3xl leading-tight sm:text-4xl">{title}</h1>
        {lead && <p className="mt-2 text-[15px] text-muted">{lead}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon: React.ReactNode; title: string; children?: React.ReactNode }) {
  return (
    <div className="bg-dots flex flex-col items-center rounded-(--radius-card) border border-dashed border-line-strong bg-surface px-6 py-12 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-surface text-muted shadow-card ring-1 ring-line">{icon}</div>
      <h3 className="mt-4 text-base font-semibold">{title}</h3>
      {children && <div className="mt-1 max-w-md text-sm text-muted">{children}</div>}
    </div>
  );
}

/** Initials in a soft disc. Colour is derived from the name so a person keeps one colour everywhere. */
const AVATAR_TINTS = ["bg-[#e8e4f7] text-[#3b3486]", "bg-[#dff1ec] text-[#0f5a52]", "bg-[#f7e9d6] text-[#7a4a0b]", "bg-[#e3ecf7] text-[#1f4a7a]", "bg-[#f4e2e6] text-[#7c2638]"];
export function Avatar({ name, size = "md", className }: { name: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("");
  const tint = AVATAR_TINTS[[...name].reduce((n, ch) => n + ch.charCodeAt(0), 0) % AVATAR_TINTS.length];
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold",
        size === "sm" && "size-8 text-xs",
        size === "md" && "size-10 text-sm",
        size === "lg" && "size-14 text-lg",
        tint,
        className,
      )}
    >
      {initials}
    </span>
  );
}

/** A labelled number. The label is a <dt>, so wrap groups in a <dl>. */
export function Stat({ label, value, hint, tone, className }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: "danger" | "success" | "primary" | "gold"; className?: string }) {
  return (
    <div className={cn("rounded-(--radius-card) border border-line bg-surface px-5 py-4 shadow-card", className)}>
      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{label}</dt>
      <dd
        className={cn(
          "mt-1 text-3xl font-semibold tabular-nums tracking-tight",
          tone === "danger" && "text-danger",
          tone === "success" && "text-success",
          tone === "primary" && "text-primary",
          tone === "gold" && "text-gold",
        )}
      >
        {value}
      </dd>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}
