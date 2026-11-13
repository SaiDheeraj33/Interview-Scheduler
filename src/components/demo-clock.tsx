"use client";

/**
 * The demo clock. Journey states are derived from time, not stored, so moving the
 * clock forward is enough to watch an interview start, end and go overdue, or a
 * waiting period run out. It changes no data.
 */
import { Clock3, FastForward, RotateCcw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MS, POLICY } from "@/domain/policy";
import { fmtDayTime, relDay } from "@/lib/time";
import { jumpClockTo, setClock, shiftClock } from "@/server/actions";
import type { ClockMark } from "@/server/queries";
import { Spinner, useAction, useNow } from "./client";
import { buttonClass, cn } from "./ui";

const SLIDER_MAX_HOURS = 7 * 24;

function fmtOffset(ms: number) {
  const mins = Math.round(ms / MS.MINUTE);
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  return [d && `${d}d`, h && `${h}h`, m && `${m}m`].filter(Boolean).join(" ") || "0m";
}

export function DemoClock({ offset, serverNow, marks }: { offset: number; serverNow: number; marks: ClockMark[] }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<number | null>(null);
  const { run, pending } = useAction();
  const now = useNow(serverNow, offset);
  const panel = useRef<HTMLDivElement>(null);
  const simulated = offset > 0;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => panel.current && !panel.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  const shown = draft ?? offset;
  const commit = () => {
    if (draft === null) return;
    const value = draft;
    setDraft(null);
    run(() => setClock({ offsetMs: value }));
  };

  return (
    <div ref={panel} className="fixed bottom-4 right-4 z-40 flex flex-col items-end print:hidden">
      {open && (
        <div
          role="dialog"
          aria-label="Demo clock"
          className="animate-rise mb-3 max-h-[calc(100dvh-6rem)] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto overscroll-contain rounded-3xl border border-line bg-surface p-4 text-ink shadow-float sm:p-5"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gold">Demo clock</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{fmtDayTime(now)}</p>
              <p className="text-sm text-muted">{simulated ? `${fmtOffset(offset)} ahead of real time` : "Real time (IST)"}</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close demo clock" className="-m-2 flex size-10 items-center justify-center rounded-full text-muted hover:bg-sunken">
              <X aria-hidden className="size-4" />
            </button>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            {[
              { label: "+15 min", by: 15 * MS.MINUTE },
              { label: "+1 hour", by: MS.HOUR },
              { label: "+1 day", by: MS.DAY },
            ].map((b) => (
              <button key={b.label} type="button" disabled={pending} onClick={() => run(() => shiftClock({ byMs: b.by }))} className={buttonClass("secondary", "sm")}>
                {b.label}
              </button>
            ))}
          </div>

          <label className="mt-3 block text-sm font-semibold" htmlFor="clock-range">
            Ahead of real time: <span className="tabular-nums text-muted">{fmtOffset(shown)}</span>
          </label>
          <input
            id="clock-range"
            type="range"
            min={0}
            max={SLIDER_MAX_HOURS * 4}
            step={1}
            value={Math.min(SLIDER_MAX_HOURS * 4, Math.round(shown / (15 * MS.MINUTE)))}
            onChange={(e) => setDraft(Number(e.target.value) * 15 * MS.MINUTE)}
            onPointerUp={commit}
            onKeyUp={commit}
            onBlur={commit}
            className="mt-2 w-full"
          />
          <div className="flex justify-between text-[11px] text-faint">
            <span>Now</span>
            <span>+7 days</span>
          </div>

          {marks.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Jump to</p>
              <ul className="mt-2 space-y-1">
                {marks.map((m) => (
                  <li key={`${m.at}-${m.label}`}>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => jumpClockTo({ at: m.at }))}
                      className="flex min-h-9 w-full items-center gap-3 rounded-xl px-3 text-left text-sm transition-colors hover:bg-sunken"
                    >
                      <FastForward aria-hidden className="size-4 shrink-0 text-gold" />
                      <span className="min-w-0 flex-1 truncate font-medium">{m.label}</span>
                      <span className="shrink-0 text-xs tabular-nums text-muted">
                        {relDay(m.at, now)} · {fmtDayTime(m.at).split(", ")[1]}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3">
            <p className="text-xs text-muted">Applies to every page and action in this browser. No data changes.</p>
            <button type="button" disabled={pending || !simulated} onClick={() => run(() => setClock({ offsetMs: 0 }))} className={cn(buttonClass("ghost", "sm"), "shrink-0")}>
              {pending ? <Spinner /> : <RotateCcw aria-hidden className="size-4" />} Real time
            </button>
          </div>
          <p className="sr-only">Up to {POLICY.demoClockMaxDays} days ahead.</p>
        </div>
      )}
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold shadow-float transition-colors",
          simulated ? "border-gold/40 bg-gold text-white hover:bg-[#854d0e]" : "border-line bg-surface text-ink hover:border-ink/30",
        )}
      >
        <Clock3 aria-hidden className="size-4" />
        <span className="tabular-nums">{simulated ? fmtDayTime(now) : "Demo clock"}</span>
        {simulated && <span className="hidden rounded-full bg-white/20 px-2 py-0.5 text-xs sm:inline">+{fmtOffset(offset)}</span>}
      </button>
    </div>
  );
}
