import { ArrowLeftRight, MonitorPlay } from "lucide-react";
import Link from "next/link";
import type { User } from "@/db/schema";
import { signOut } from "@/server/actions";
import { getClockOffset, getNow } from "@/server/clock";
import { getClockMarks } from "@/server/queries";
import { DemoClock } from "./demo-clock";
import { Avatar, cn } from "./ui";

const NAV: Record<User["role"], { href: string; label: string }[]> = {
  student: [{ href: "/student", label: "My interviews" }],
  interviewer: [
    { href: "/interviewer", label: "Schedule" },
    { href: "/interviewer/availability", label: "Availability" },
  ],
  admin: [{ href: "/team", label: "Dashboard" }],
};
export const ROLE_LABEL: Record<User["role"], string> = { student: "Student", interviewer: "Interviewer", admin: "Interview team lead" };

export function Wordmark() {
  return (
    <Link href="/" className="flex items-center gap-2.5 rounded-lg" aria-label="GRIT Interviews, home">
      <span className="flex h-8 items-center rounded-lg bg-ink px-2 text-[13px] font-bold tracking-[0.2em] text-white">GRIT</span>
      <span className="hidden font-display text-lg leading-none sm:inline">Interviews</span>
    </Link>
  );
}

/**
 * Page frame. `data-persona` re-tints the accent for the person using the screen, so
 * each persona's product feels like its own while sharing every component.
 */
export async function AppShell({
  user,
  active,
  children,
  width = "max-w-6xl",
  bare = false,
}: {
  user?: User | null;
  active?: string;
  children: React.ReactNode;
  width?: string;
  /** For pages embedded in the side-by-side demo: no header or footer. */
  bare?: boolean;
}) {
  const [offset, now] = await Promise.all([getClockOffset(), getNow()]);
  const marks = bare ? [] : await getClockMarks(now, user?.id);
  const persona = user?.role ?? "guest";

  return (
    <div data-persona={persona} className="flex min-h-dvh flex-col">
      {!bare && (
        <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur-md">
          <div className={cn("mx-auto flex min-h-16 items-center gap-x-3 px-4 sm:gap-x-6 sm:px-6", width)}>
            <Wordmark />
            {user && (
              <nav aria-label="Main" className="flex items-center gap-1">
                {NAV[user.role].map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active === item.href ? "page" : undefined}
                    className={cn(
                      "relative whitespace-nowrap rounded-lg px-2 py-2 text-sm font-semibold transition-colors sm:px-3",
                      active === item.href ? "text-ink after:absolute after:inset-x-3 after:-bottom-[13px] after:h-0.5 after:rounded-full after:bg-primary" : "text-muted hover:text-ink",
                    )}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            )}
            <div className="ml-auto flex items-center gap-2">
              <Link
                href="/live"
                className={cn("hidden min-h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-colors md:flex", active === "/live" ? "text-ink" : "text-muted hover:text-ink")}
              >
                <MonitorPlay aria-hidden className="size-4" /> Live demo
              </Link>
              {user ? (
                <form action={signOut} className="flex items-center">
                  <button
                    type="submit"
                    className="group flex min-h-11 items-center gap-2.5 rounded-full border border-line bg-surface py-1 pl-1 pr-3 text-left transition-colors hover:border-ink/30"
                    aria-label={`Signed in as ${user.name}, ${ROLE_LABEL[user.role]}. Switch persona`}
                  >
                    <Avatar name={user.name} size="sm" />
                    <span className="hidden leading-tight sm:block">
                      <span className="block text-sm font-semibold">{user.name}</span>
                      <span className="block text-[11px] text-muted">{ROLE_LABEL[user.role]}</span>
                    </span>
                    <ArrowLeftRight aria-hidden className="size-4 text-muted group-hover:text-ink" />
                  </button>
                </form>
              ) : (
                <Link href="/before-after" className="min-h-9 rounded-lg px-3 py-2 text-sm font-semibold text-muted hover:text-ink">
                  Before &amp; after
                </Link>
              )}
            </div>
          </div>
        </header>
      )}
      <main id="main" className={cn("mx-auto w-full flex-1 px-4 sm:px-6", bare ? "py-5" : "animate-rise py-8 sm:py-12", width)}>
        {children}
      </main>
      {!bare && (
        <>
          <footer className={cn("mx-auto w-full px-4 pb-24 pt-6 text-xs text-muted sm:px-6", width)}>
            <div className="flex flex-wrap justify-between gap-2 border-t border-line pt-6">
              <span>All times are shown in IST. Prototype with demo data; no real students or interviewers.</span>
              <span className="flex gap-4">
                <Link href="/live" className="hover:text-ink">
                  Live demo
                </Link>
                <Link href="/before-after" className="hover:text-ink">
                  Before &amp; after
                </Link>
                <Link href="/" className="hover:text-ink">
                  Personas
                </Link>
              </span>
            </div>
          </footer>
          <DemoClock offset={offset} serverNow={now} marks={marks} />
        </>
      )}
    </div>
  );
}
