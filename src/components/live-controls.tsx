"use client";

import { FastForward, RotateCcw } from "lucide-react";
import { jumpClockTo, setClock } from "@/server/actions";
import { Spinner, useAction } from "./client";
import { buttonClass } from "./ui";

/** The two clock moves the side-by-side demo needs, as one-click buttons. */
export function LiveControls({ jumps, simulated }: { jumps: { at: number; label: string }[]; simulated: boolean }) {
  const { run, pending } = useAction();
  return (
    <div className="flex flex-wrap items-center gap-2">
      {jumps.map((j) => (
        <button key={j.label} type="button" className={buttonClass("gold", "sm")} disabled={pending} onClick={() => run(() => jumpClockTo({ at: j.at }))}>
          {pending ? <Spinner /> : <FastForward aria-hidden className="size-4" />} {j.label}
        </button>
      ))}
      {simulated && (
        <button type="button" className={buttonClass("ghost", "sm")} disabled={pending} onClick={() => run(() => setClock({ offsetMs: 0 }))}>
          <RotateCcw aria-hidden className="size-4" /> Back to real time
        </button>
      )}
    </div>
  );
}
