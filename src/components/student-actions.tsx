"use client";

import { CalendarClock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { bookSlot, cancelBooking } from "@/server/actions";
import { Modal, ResultNote, Spinner, useAction } from "./client";
import { buttonClass, cn } from "./ui";

/** Cancelling gives up a scarce slot, so it asks once before doing it. */
export function CancelBookingButton({ bookingId, when }: { bookingId: string; when: string }) {
  const [open, setOpen] = useState(false);
  const { run, pending, result, clear } = useAction();
  const close = () => {
    setOpen(false);
    clear();
  };
  return (
    <>
      <button type="button" className={buttonClass("ghost")} onClick={() => setOpen(true)}>
        Cancel interview
      </button>
      <Modal open={open} onClose={close} title="Cancel this interview?">
        <p className="text-sm text-muted">
          Your interview on <strong className="text-ink">{when}</strong> will be cancelled and the slot given back. You stay eligible and can book another time, but your badge
          waits until you do.
        </p>
        <ResultNote result={result} className="mt-3" />
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" className={buttonClass("secondary")} onClick={close}>
            Keep my interview
          </button>
          <button type="button" className={buttonClass("danger")} disabled={pending} onClick={() => run(() => cancelBooking({ bookingId }), close)}>
            {pending && <Spinner />} Cancel interview
          </button>
        </div>
      </Modal>
    </>
  );
}

export interface PickerDay {
  key: string;
  weekday: string;
  dayNum: string;
  month: string;
  long: string;
  times: { startsAt: number; label: string; range: string; hour: number; last: boolean }[];
}

const PARTS = [
  { label: "Morning", from: 0, to: 12 },
  { label: "Afternoon", from: 12, to: 16 },
  { label: "Evening", from: 16, to: 24 },
];

/**
 * Two decisions, in order: a day, then a time. The confirm panel repeats the choice
 * in full before anything is committed, and states the rules that apply afterwards.
 */
export function SlotPicker({ candidacyId, days, mode, rules }: { candidacyId: string; days: PickerDay[]; mode: "book" | "reschedule"; rules: string[] }) {
  const router = useRouter();
  const [dayKey, setDayKey] = useState(days[0]?.key ?? "");
  const [startsAt, setStartsAt] = useState<number | null>(null);
  const { run, pending, result } = useAction();

  const day = days.find((d) => d.key === dayKey) ?? days[0];
  // If the list refreshed and the chosen time is gone, drop the selection.
  const chosen = useMemo(() => day?.times.find((t) => t.startsAt === startsAt) ?? null, [day, startsAt]);

  if (!day) return null;

  const confirm = () => {
    if (!chosen) return;
    run(
      async () => {
        const r = await bookSlot({ candidacyId, startsAt: chosen.startsAt });
        if (!r.ok) {
          setStartsAt(null);
          router.refresh();
        }
        return r;
      },
      () => router.push("/student"),
    );
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-6">
        <fieldset>
          <legend className="text-sm font-semibold">1. Pick a day</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {days.map((d) => {
              const active = d.key === day.key;
              return (
                <button
                  key={d.key}
                  type="button"
                  aria-pressed={active}
                  aria-label={`${d.long}, ${d.times.length} slot${d.times.length === 1 ? "" : "s"} open`}
                  onClick={() => {
                    setDayKey(d.key);
                    setStartsAt(null);
                  }}
                  className={cn(
                    "flex min-h-16 w-[4.25rem] flex-col items-center justify-center rounded-xl border px-2 py-1.5 transition-colors",
                    active ? "border-primary bg-primary text-on-primary" : "border-line bg-surface hover:border-primary",
                  )}
                >
                  <span className="text-xs font-medium">{d.weekday}</span>
                  <span className="font-display text-lg font-semibold leading-tight">{d.dayNum}</span>
                  <span className={cn("text-[11px]", active ? "text-on-primary/85" : "text-muted")}>{d.times.length} open</span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-semibold">2. Pick a time on {day.long}</legend>
          <div className="mt-2 space-y-4">
            {PARTS.map((part) => {
              const times = day.times.filter((t) => t.hour >= part.from && t.hour < part.to);
              if (!times.length) return null;
              return (
                <div key={part.label}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">{part.label}</p>
                  <div className="mt-1.5 grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {times.map((t) => {
                      const active = t.startsAt === startsAt;
                      return (
                        <button
                          key={t.startsAt}
                          type="button"
                          aria-pressed={active}
                          onClick={() => setStartsAt(t.startsAt)}
                          className={cn(
                            "relative min-h-11 rounded-xl border px-2 text-sm font-semibold tabular-nums transition-colors",
                            active ? "border-primary bg-primary text-on-primary" : "border-line bg-surface hover:border-primary hover:text-primary",
                          )}
                        >
                          {t.label}
                          {t.last && <span className={cn("block text-[11px] font-medium", active ? "text-on-primary/85" : "text-warning")}>Last one</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </fieldset>
      </div>

      <aside className="h-fit rounded-(--radius-card) border border-line bg-surface p-5 shadow-card lg:sticky lg:top-20" aria-live="polite">
        <h2 className="text-base font-semibold">{mode === "book" ? "Your interview" : "Your new time"}</h2>
        {chosen ? (
          <div className="mt-3 flex gap-3 rounded-xl bg-primary-soft p-3">
            <CalendarClock aria-hidden className="mt-0.5 size-5 shrink-0 text-primary" />
            <div>
              <p className="font-semibold">{day.long}</p>
              <p className="text-sm">{chosen.range} IST</p>
              <p className="text-sm text-muted">Online · 30 minutes</p>
            </div>
          </div>
        ) : (
          <p className="mt-3 rounded-xl bg-sunken p-3 text-sm text-muted">Choose a day and a time to continue.</p>
        )}
        <ul className="mt-4 space-y-2 text-sm text-muted">
          {rules.map((rule) => (
            <li key={rule} className="flex gap-2">
              <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-muted/60" />
              {rule}
            </li>
          ))}
        </ul>
        <ResultNote result={result} className="mt-4" />
        <button type="button" disabled={!chosen || pending} onClick={confirm} className={cn(buttonClass("primary"), "mt-4 w-full")}>
          {pending && <Spinner />}
          {mode === "book" ? "Confirm booking" : "Confirm new time"}
        </button>
      </aside>
    </div>
  );
}
