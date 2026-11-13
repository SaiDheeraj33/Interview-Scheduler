"use client";

/** Shared client-side pieces: running a server action, showing its result, and an accessible modal. */
import { CircleAlert, CircleCheck, Loader, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { ActionResult } from "@/server/actions";
import { cn } from "./ui";

const TOAST_EVENT = "grit:toast";
export const toast = (message: string) => window.dispatchEvent(new CustomEvent<string>(TOAST_EVENT, { detail: message }));

/** One polite, self-dismissing confirmation at the bottom of the page. Mounted once in the root layout. */
export function Toaster() {
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const show = (e: Event) => {
      setMessage((e as CustomEvent<string>).detail);
      clearTimeout(timer);
      timer = setTimeout(() => setMessage(null), 6000);
    };
    window.addEventListener(TOAST_EVENT, show);
    return () => {
      window.removeEventListener(TOAST_EVENT, show);
      clearTimeout(timer);
    };
  }, []);
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      {message && (
        <p className="pointer-events-auto flex max-w-lg items-start gap-2 rounded-xl bg-ink px-4 py-3 text-sm font-medium text-surface shadow-card">
          <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>{message}</span>
          <button type="button" onClick={() => setMessage(null)} aria-label="Dismiss" className="-my-1 -mr-2 flex size-8 shrink-0 items-center justify-center rounded-full hover:bg-surface/15">
            <X aria-hidden className="size-4" />
          </button>
        </p>
      )}
    </div>
  );
}

/** Runs a server action, tracks pending state, and keeps the last result for display. */
export function useAction() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const run = useCallback(
    (action: () => Promise<ActionResult>, onSuccess?: (r: ActionResult) => void) => {
      setResult(null);
      start(async () => {
        try {
          const r = await action();
          setResult(r);
          if (r.ok) {
            // The control that triggered this may leave the page with its row, so confirm at page level too.
            toast(r.message);
            onSuccess?.(r);
          }
        } catch {
          setResult({ ok: false, code: "NETWORK", message: "Something went wrong on our side. Nothing was changed. Please try again." });
        }
      });
    },
    [],
  );
  return { run, pending, result, clear: () => setResult(null) };
}

/** Errors are announced assertively, next to the control that caused them. Successes go to the toaster. */
export function ResultNote({ result, className }: { result: ActionResult | null; className?: string }) {
  if (!result || result.ok) return null;
  const Icon = result.ok ? CircleCheck : CircleAlert;
  return (
    <p
      role={result.ok ? "status" : "alert"}
      className={cn("flex items-start gap-2 rounded-lg px-3 py-2 text-sm font-medium", result.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger", className)}
    >
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>{result.message}</span>
    </p>
  );
}

/**
 * Keeps a screen current without a reload: re-fetches the server render every few
 * seconds while the tab is visible, and immediately when the person comes back to it.
 * An interviewer's outcome reaches the student's open dashboard within one interval.
 */
export function LiveRefresh({ every = 8000 }: { every?: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => document.visibilityState === "visible" && !document.querySelector("dialog[open]") && router.refresh();
    const timer = setInterval(tick, every);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router, every]);
  return null;
}

/** The demo clock's current time on the client: real time plus the server's offset. */
export function useNow(serverNow: number, offset: number, every = 1000) {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    setNow(Date.now() + offset);
    const timer = setInterval(() => setNow(Date.now() + offset), every);
    return () => clearInterval(timer);
  }, [offset, every]);
  return now;
}

function fmtCountdown(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** A ticking countdown to (or time since) a moment. The label stays readable to screen readers without announcing every second. */
export function Countdown({ target, serverNow, offset, className }: { target: number; serverNow: number; offset: number; className?: string }) {
  const now = useNow(serverNow, offset);
  const left = target - now;
  return (
    <span className={cn("tabular-nums", className)} aria-live="off">
      {left >= 0 ? fmtCountdown(left) : `+${fmtCountdown(-left)}`}
    </span>
  );
}

export function Spinner() {
  return <Loader aria-hidden className="size-4 animate-spin" />;
}

/** Native <dialog>: focus trap, Escape to close and inert background come from the browser. */
export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-labelledby="modal-title"
      className="m-auto w-[min(34rem,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-0 text-ink shadow-card"
    >
      {open && (
        <div className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <h2 id="modal-title" className="text-lg font-semibold">
              {title}
            </h2>
            <button type="button" onClick={onClose} aria-label="Close" className="-m-2 flex size-11 items-center justify-center rounded-full text-muted hover:bg-sunken">
              <X aria-hidden className="size-5" />
            </button>
          </div>
          <div className="mt-4">{children}</div>
        </div>
      )}
    </dialog>
  );
}
