"use client";

import { RotateCcw } from "lucide-react";
import Link from "next/link";

/** Last line of defence: say what happened in plain words and offer a way forward. Nothing was changed. */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-6 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gold">Something went wrong</p>
      <h1 className="mt-3 font-display text-3xl">We couldn&apos;t load this page</h1>
      <p className="mt-3 text-muted">Nothing was changed. This is usually temporary. Try again, or go back to the start.</p>
      <div className="mt-6 flex gap-3">
        <button type="button" onClick={reset} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-ink px-5 font-semibold text-white">
          <RotateCcw aria-hidden className="size-4" /> Try again
        </button>
        <Link href="/" className="inline-flex min-h-11 items-center rounded-xl border border-line-strong bg-surface px-5 font-semibold">
          Home
        </Link>
      </div>
    </main>
  );
}
