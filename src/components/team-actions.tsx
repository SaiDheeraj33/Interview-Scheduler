"use client";

import { Bell, ChevronDown, ExternalLink, Flag, Search, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { JourneyState } from "@/domain/journey";
import { fmtDayTime } from "@/lib/time";
import { clearFlag, flagCandidacy, nudgeStudent } from "@/server/actions";
import { Modal, ResultNote, Spinner, useAction } from "./client";
import { Avatar, buttonClass, Chip, cn, EmptyState, StateChip } from "./ui";

export function RowActions({ candidacyId, student, canNudge, flagged, hasBadge }: { candidacyId: string; student: string; canNudge: boolean; flagged: boolean; hasBadge: boolean }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const nudge = useAction();
  const flag = useAction();
  const close = () => {
    setOpen(false);
    flag.clear();
  };

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap justify-end gap-1.5">
        {canNudge && (
          <button type="button" className={buttonClass("secondary", "sm")} disabled={nudge.pending || nudge.result?.ok} onClick={() => nudge.run(() => nudgeStudent({ candidacyId }))}>
            {nudge.pending ? <Spinner /> : <Bell aria-hidden className="size-4" />} {nudge.result?.ok ? "Reminded" : "Remind"}
          </button>
        )}
        {flagged ? (
          <button type="button" className={buttonClass("secondary", "sm")} onClick={() => setOpen(true)}>
            <ShieldCheck aria-hidden className="size-4" /> Clear flag
          </button>
        ) : (
          <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setOpen(true)} aria-label={`Flag ${student} for malpractice`}>
            <Flag aria-hidden className="size-4" /> Flag
          </button>
        )}
      </div>
      {nudge.result && !nudge.result.ok && <ResultNote result={nudge.result} className="max-w-56 text-left" />}

      <Modal open={open} onClose={close} title={flagged ? `Clear the flag on ${student}?` : `Flag ${student} for malpractice?`}>
        {flagged ? (
          <>
            <p className="text-sm text-muted">
              Use this when the review found no malpractice. {hasBadge ? "The badge and its bonus Miles are restored." : "The student can book an interview again."} The student is
              told, and the decision is kept on the audit trail.
            </p>
            <ResultNote result={flag.result} className="mt-3" />
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className={buttonClass("secondary")} onClick={close}>
                Cancel
              </button>
              <button type="button" className={buttonClass("primary")} disabled={flag.pending} onClick={() => flag.run(() => clearFlag({ candidacyId }), close)}>
                {flag.pending && <Spinner />} Clear flag
              </button>
            </div>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              flag.run(() => flagCandidacy({ candidacyId, reason }), close);
            }}
          >
            <p className="text-sm text-muted">
              {hasBadge
                ? "This student has already earned the badge. Flagging nullifies it and reverses its bonus Miles straight away."
                : "Flagging blocks booking for this badge and cancels any interview already booked."}{" "}
              The student is told. You can clear the flag later if the review finds nothing.
            </p>
            <label htmlFor={`reason-${candidacyId}`} className="mt-4 block text-sm font-semibold">
              Reason <span className="text-danger">(required)</span>
            </label>
            <p id={`reason-help-${candidacyId}`} className="text-xs text-muted">
              Kept on the audit trail. Not shown to the student.
            </p>
            <textarea
              id={`reason-${candidacyId}`}
              aria-describedby={`reason-help-${candidacyId}`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={500}
              required
              minLength={10}
              className="mt-1.5 w-full rounded-xl border border-line-strong bg-surface p-3 text-sm"
            />
            <ResultNote result={flag.result} className="mt-3" />
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className={buttonClass("secondary")} onClick={close}>
                Cancel
              </button>
              <button type="submit" className={buttonClass("danger")} disabled={flag.pending || reason.trim().length < 10}>
                {flag.pending && <Spinner />} {hasBadge ? "Flag and nullify badge" : "Flag and block booking"}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

export interface PipelineItem {
  candidacyId: string;
  name: string;
  campus: string;
  badge: string;
  state: JourneyState;
  main: string;
  sub?: string;
  alert?: boolean;
  attempts: number;
  canNudge: boolean;
  flagged: boolean;
  hasBadge: boolean;
  roomHref: string | null;
  events: { id: string; summary: string; createdAt: number }[];
}

/** The list the team works through. Type to filter (press / from anywhere); open a row for its full history. */
export function PipelineList({ items, emptyText }: { items: PipelineItem[]; emptyText: string }) {
  const [q, setQ] = useState("");
  const [openRow, setOpenRow] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "/" && !["INPUT", "TEXTAREA"].includes(t.tagName) && !document.querySelector("dialog[open]")) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((i) => `${i.name} ${i.campus} ${i.badge}`.toLowerCase().includes(needle));
  }, [items, q]);

  return (
    <div>
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-faint" />
        <input
          ref={input}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by student, campus or badge"
          aria-label="Search students"
          className="min-h-11 w-full rounded-xl border border-line-strong bg-surface pl-10 pr-12 text-sm"
        />
        <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md border border-line px-1.5 text-xs text-faint sm:block">/</kbd>
      </div>

      <div className="mt-3">
        {shown.length === 0 ? (
          <EmptyState icon={<Users aria-hidden className="size-6" />} title={q ? "No one matches" : "Nobody here right now"}>
            {q ? "Try a different name or campus." : emptyText}
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-(--radius-card) border border-line bg-surface shadow-card">
            {shown.map((row) => {
              const expanded = openRow === row.candidacyId;
              return (
                <li key={row.candidacyId}>
                  <div className="grid items-center gap-x-5 gap-y-2 px-4 py-3.5 sm:px-5 md:grid-cols-[minmax(0,1.2fr)_10.5rem_minmax(0,1.3fr)_auto]">
                    <button
                      type="button"
                      onClick={() => setOpenRow(expanded ? null : row.candidacyId)}
                      aria-expanded={expanded}
                      className="flex min-w-0 items-center gap-3 rounded-lg text-left"
                    >
                      <Avatar name={row.name} size="sm" />
                      <span className="min-w-0">
                        <span className="flex items-center gap-1 truncate font-semibold">
                          {row.name}
                          <ChevronDown aria-hidden className={cn("size-4 shrink-0 text-faint transition-transform", expanded && "rotate-180")} />
                        </span>
                        <span className="block truncate text-xs text-muted">
                          {row.badge} · {row.campus}
                        </span>
                      </span>
                    </button>
                    <div className="flex flex-wrap gap-1.5">
                      <StateChip state={row.state} />
                      {row.attempts > 0 && row.state !== "PASSED" && <Chip>Attempts: {row.attempts}</Chip>}
                    </div>
                    <div className="min-w-0 text-sm">
                      <p className={cn("font-medium", row.alert && "text-danger")}>{row.main}</p>
                      {row.sub && <p className="text-muted">{row.sub}</p>}
                    </div>
                    <div className="flex items-center justify-end gap-1.5">
                      {row.roomHref && (
                        <Link href={row.roomHref} className={buttonClass("ghost", "sm")} aria-label={`Open ${row.name}'s interview`}>
                          <ExternalLink aria-hidden className="size-4" />
                        </Link>
                      )}
                      <RowActions candidacyId={row.candidacyId} student={row.name} canNudge={row.canNudge} flagged={row.flagged} hasBadge={row.hasBadge} />
                    </div>
                  </div>
                  {expanded && (
                    <div className="animate-fade border-t border-line bg-sunken/60 px-5 py-4">
                      <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">History</h4>
                      {row.events.length === 0 ? (
                        <p className="mt-2 text-sm text-muted">No events yet.</p>
                      ) : (
                        <ol className="mt-3 space-y-2.5 border-l border-line-strong pl-4 text-sm">
                          {row.events.map((e) => (
                            <li key={e.id} className="relative">
                              <span aria-hidden className="absolute -left-[21px] top-1.5 size-2.5 rounded-full border-2 border-sunken bg-primary" />
                              {e.summary} <span className="text-xs text-muted">· {fmtDayTime(e.createdAt)}</span>
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
