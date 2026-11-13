"use client";

/**
 * Availability as a week grid, like a paper diary: press on a cell and drag to paint
 * open (or closed) time across days. Every cell is also a real button, so it works by
 * keyboard and by tap. Changes show instantly and are saved as one batch on release;
 * if the save fails, the grid snaps back and says why.
 */
import { CalendarPlus, CalendarX, Lock, MousePointerClick } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { setDay, setSlots } from "@/server/actions";
import { ResultNote, Spinner, useAction } from "./client";
import { buttonClass, cn } from "./ui";

export type CellState = "off" | "open" | "booked" | "past";
export interface GridDay {
  key: string;
  weekday: string;
  dayNum: string;
  long: string;
  isToday: boolean;
  cells: { startsAt: number; state: CellState }[];
}

export function AvailabilityGrid({ weeks, rowLabels }: { weeks: { label: string; days: GridDay[] }[]; rowLabels: string[] }) {
  const [week, setWeek] = useState(0);
  const [mobileDay, setMobileDay] = useState(0);
  const [overlay, setOverlay] = useState<Map<number, CellState>>(new Map());
  const [drag, setDrag] = useState<{ open: boolean; cells: Set<number> } | null>(null);
  const { run, pending, result } = useAction();
  const [busyDay, setBusyDay] = useState<string | null>(null);
  const dragRef = useRef(drag);
  const lastPointer = useRef<string>("mouse");
  dragRef.current = drag;

  // A fresh server render replaces the optimistic overlay.
  useEffect(() => setOverlay(new Map()), [weeks]);

  const days = weeks[week]?.days ?? [];
  const stateOf = (c: { startsAt: number; state: CellState }): CellState => {
    if (drag?.cells.has(c.startsAt)) return drag.open ? "open" : "off";
    return overlay.get(c.startsAt) ?? c.state;
  };
  const paintable = (s: CellState) => s === "open" || s === "off";

  const commit = (cells: number[], open: boolean) => {
    if (!cells.length) return;
    setOverlay((m) => {
      const next = new Map(m);
      for (const t of cells) next.set(t, open ? "open" : "off");
      return next;
    });
    run(async () => {
      const r = await setSlots({ starts: cells, open });
      if (!r.ok) setOverlay(new Map());
      return r;
    });
  };

  // Mouse and pen paint by dragging; touch taps (dragging would fight page scroll).
  const onDown = (e: React.PointerEvent, c: { startsAt: number; state: CellState }) => {
    lastPointer.current = e.pointerType;
    if (e.pointerType === "touch" || e.button !== 0) return;
    const s = stateOf(c);
    if (!paintable(s)) return;
    e.preventDefault();
    setDrag({ open: s === "off", cells: new Set([c.startsAt]) });
  };
  const onEnter = (c: { startsAt: number; state: CellState }) => {
    const d = dragRef.current;
    if (!d || !paintable(overlay.get(c.startsAt) ?? c.state)) return;
    if (!d.cells.has(c.startsAt)) setDrag({ ...d, cells: new Set(d.cells).add(c.startsAt) });
  };
  useEffect(() => {
    const up = () => {
      const d = dragRef.current;
      if (!d) return;
      setDrag(null);
      commit([...d.cells], d.open);
    };
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totals = useMemo(() => {
    const all = days.flatMap((d) => d.cells.map(stateOf));
    return { open: all.filter((s) => s === "open").length, booked: all.filter((s) => s === "booked").length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, overlay, drag]);

  const dayActions = (d: GridDay, compact = false) => (
    <div className={cn("flex", compact ? "gap-0.5" : "gap-2")}>
      <button
        type="button"
        title="Open 10:00–13:00 and 14:00–17:00"
        aria-label={`Open the usual hours on ${d.long}`}
        disabled={pending}
        onClick={() => {
          setBusyDay(`fill-${d.key}`);
          run(() => setDay({ day: d.key, mode: "fill" }));
        }}
        className={compact ? "flex size-7 items-center justify-center rounded-lg text-muted hover:bg-primary-soft hover:text-primary" : buttonClass("secondary", "sm")}
      >
        {pending && busyDay === `fill-${d.key}` ? <Spinner /> : <CalendarPlus aria-hidden className="size-4" />}
        {!compact && "Usual hours"}
      </button>
      <button
        type="button"
        title="Close every unbooked slot"
        aria-label={`Close unbooked slots on ${d.long}`}
        disabled={pending}
        onClick={() => {
          setBusyDay(`clear-${d.key}`);
          run(() => setDay({ day: d.key, mode: "clear" }));
        }}
        className={compact ? "flex size-7 items-center justify-center rounded-lg text-muted hover:bg-danger-soft hover:text-danger" : buttonClass("ghost", "sm")}
      >
        {pending && busyDay === `clear-${d.key}` ? <Spinner /> : <CalendarX aria-hidden className="size-4" />}
        {!compact && "Clear"}
      </button>
    </div>
  );

  const cellButton = (c: { startsAt: number; state: CellState }, label: string, tall = false) => {
    const s = stateOf(c);
    if (s === "booked")
      return (
        <span
          key={c.startsAt}
          title="Booked by a student"
          className={cn("flex w-full items-center justify-center gap-1 rounded-md bg-success-soft text-[11px] font-semibold text-success ring-1 ring-success/20", tall ? "min-h-11" : "h-7")}
        >
          <Lock aria-hidden className="size-3" />
          {tall && label}
          <span className="sr-only">{label}, booked</span>
        </span>
      );
    return (
      <button
        key={c.startsAt}
        type="button"
        data-start={c.startsAt}
        aria-pressed={s === "open"}
        aria-label={`${label}, ${s === "open" ? "open" : s === "past" ? "past" : "closed"}`}
        disabled={s === "past"}
        onPointerDown={(e) => onDown(e, c)}
        onPointerEnter={() => onEnter(c)}
        onClick={(e) => {
          // Keyboard and touch toggle one cell; mouse clicks are handled by the drag.
          if (e.detail === 0 || lastPointer.current === "touch") commit([c.startsAt], s === "off");
        }}
        className={cn(
          "block w-full rounded-md text-[11px] font-semibold transition-colors",
          tall ? "min-h-11" : "h-7",
          s === "open" && "bg-primary text-on-primary hover:bg-primary-strong",
          s === "off" && "bg-surface text-faint ring-1 ring-inset ring-line hover:bg-primary-soft hover:ring-primary/40",
          s === "past" && "bg-sunken/60 text-transparent",
        )}
      >
        {tall ? label : <span className="sr-only">{label}</span>}
      </button>
    );
  };

  const mDay = days[mobileDay] ?? days[0];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border border-line bg-surface p-1" role="tablist" aria-label="Week">
          {weeks.map((w, i) => (
            <button
              key={w.label}
              type="button"
              role="tab"
              aria-selected={week === i}
              onClick={() => {
                setWeek(i);
                setMobileDay(0);
              }}
              className={cn("min-h-9 rounded-lg px-4 text-sm font-semibold transition-colors", week === i ? "bg-primary text-on-primary" : "text-muted hover:text-ink")}
            >
              {w.label}
            </button>
          ))}
        </div>
        <p className="text-sm text-muted">
          <strong className="tabular-nums text-ink">{totals.open}</strong> open · <strong className="tabular-nums text-ink">{totals.booked}</strong> booked this week
        </p>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-surface ring-1 ring-inset ring-line" aria-hidden /> Closed
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-primary" aria-hidden /> Open for students
        </span>
        <span className="flex items-center gap-1.5">
          <Lock aria-hidden className="size-3 text-success" /> Booked
        </span>
        <span className="hidden items-center gap-1.5 md:flex">
          <MousePointerClick aria-hidden className="size-3.5" /> Press and drag to paint across days
        </span>
      </div>
      <div className="mt-3 min-h-10" aria-live="polite">
        <ResultNote result={result} />
      </div>

      {/* Desktop and tablet: the whole week. */}
      <div className="hidden select-none rounded-(--radius-card) border border-line bg-surface p-4 shadow-card md:block" style={{ touchAction: drag ? "none" : undefined }}>
        <div className="grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] gap-x-1.5">
          <span />
          {days.map((d) => (
            <div key={d.key} className="pb-2 text-center">
              <p className={cn("text-xs font-semibold uppercase", d.isToday ? "text-primary" : "text-muted")}>{d.weekday}</p>
              <p className={cn("mx-auto mt-0.5 flex size-8 items-center justify-center rounded-full text-sm font-semibold tabular-nums", d.isToday && "bg-primary text-on-primary")}>{d.dayNum}</p>
              <div className="mt-1 flex justify-center">{dayActions(d, true)}</div>
            </div>
          ))}
          {rowLabels.map((label, r) => (
            <div key={label} className="contents">
              <span className={cn("pr-2 text-right text-[11px] tabular-nums text-faint", r % 2 === 0 ? "-mt-1.5" : "invisible")}>{label}</span>
              {days.map((d) => (
                <div key={d.key} className="py-[1.5px]">
                  {d.cells[r] && cellButton(d.cells[r]!, `${d.long}, ${label}`)}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Phone: one day at a time, with full-size targets. */}
      <div className="md:hidden">
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-2">
          {days.map((d, i) => (
            <button
              key={d.key}
              type="button"
              aria-pressed={i === mobileDay}
              onClick={() => setMobileDay(i)}
              className={cn("flex min-h-14 min-w-12 flex-col items-center justify-center rounded-xl border px-2", i === mobileDay ? "border-primary bg-primary text-on-primary" : "border-line bg-surface")}
            >
              <span className="text-[11px] font-semibold uppercase">{d.weekday}</span>
              <span className="font-semibold tabular-nums">{d.dayNum}</span>
            </button>
          ))}
        </div>
        {mDay && (
          <div className="mt-2 rounded-(--radius-card) border border-line bg-surface p-4 shadow-card">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold">{mDay.long}</h2>
              {dayActions(mDay)}
            </div>
            <div className="mt-3 grid grid-cols-4 gap-1.5">{mDay.cells.map((c, r) => cellButton(c, rowLabels[r] ?? "", true))}</div>
          </div>
        )}
      </div>
    </div>
  );
}
