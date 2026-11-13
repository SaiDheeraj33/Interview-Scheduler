import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-6 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gold">Not found</p>
      <h1 className="mt-3 font-display text-3xl">This page isn&apos;t here</h1>
      <p className="mt-3 text-muted">It may have moved, or it belongs to someone else&apos;s account. Your interviews are on your dashboard.</p>
      <Link href="/" className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-ink px-5 font-semibold text-white">
        Back to the start
      </Link>
    </main>
  );
}
