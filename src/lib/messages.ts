/**
 * Every word a student reads in the interview flow is written here, once.
 * The dashboard card and the stored notification use the same sentences,
 * so a student never sees two versions of the same news.
 */
import type { JourneyState, Outcome } from "@/domain/journey";
import { POLICY } from "@/domain/policy";
import { daysBetween, fmtDate, fmtDay, fmtDayTime, fmtGap, fmtRange, fmtTime, relDay } from "./time";

export interface BadgeRef {
  track: string;
  tier: string;
  bonusMiles: number;
}

export interface Message {
  title: string;
  body: string;
}

const badgeName = (b: BadgeRef) => `${b.tier} · ${b.track}`;
const miles = (n: number) => n.toLocaleString("en-IN");
const deadline = () => fmtDate(POLICY.qualifierDeadline);

export const notify = {
  eligible: (b: BadgeRef): Message => ({
    title: `You're eligible for your ${b.tier} interview`,
    body: `You've cleared every skill for the ${b.tier} badge in ${b.track}. One step left: a ${POLICY.slotMinutes}-minute online interview. Pick any open slot in the next ${POLICY.horizonDays} days. Earn the badge by ${deadline()} to count for the Qualifier.`,
  }),

  booked: (b: BadgeRef, startsAt: number, endsAt: number, interviewer: string): Message => ({
    title: `Interview booked: ${fmtDayTime(startsAt)} IST`,
    body: `Your ${badgeName(b)} interview is with ${interviewer}, ${fmtRange(startsAt, endsAt)} IST. The join link appears on your dashboard ${POLICY.joinWindowMinutes} minutes before the start. Need a different time? You can reschedule once, up to ${POLICY.changeCutoffHours} hours before.`,
  }),

  rescheduled: (b: BadgeRef, startsAt: number, endsAt: number, interviewer: string): Message => ({
    title: `Interview moved to ${fmtDayTime(startsAt)} IST`,
    body: `Your ${badgeName(b)} interview is now with ${interviewer}, ${fmtRange(startsAt, endsAt)} IST. You've used your one reschedule, so this time is final.`,
  }),

  cancelled: (b: BadgeRef, startsAt: number): Message => ({
    title: "Interview cancelled",
    body: `You cancelled your ${badgeName(b)} interview on ${fmtDayTime(startsAt)} IST. Your eligibility is unchanged. Book a new slot whenever you're ready, and before ${deadline()} to count for the Qualifier.`,
  }),

  teamCancelled: (b: BadgeRef, startsAt: number): Message => ({
    title: "Your interview needs a new time",
    body: `Sorry, your interviewer can no longer make ${fmtDayTime(startsAt)} IST and nobody else was free at that time. This doesn't use your reschedule or count as an attempt. Please pick a new slot for your ${badgeName(b)} interview.`,
  }),

  reassigned: (b: BadgeRef, startsAt: number, interviewer: string): Message => ({
    title: "Your interviewer has changed",
    body: `Your ${badgeName(b)} interview is still at ${fmtDayTime(startsAt)} IST. You'll now meet ${interviewer}. Nothing else changes.`,
  }),

  pass: (b: BadgeRef): Message => ({
    title: `You passed. ${b.tier} badge earned`,
    body: `You cleared your interview for ${b.track}. Your ${b.tier} badge and ${miles(b.bonusMiles)} bonus Miles are on your profile now, and you're in for the Qualifier leaderboard.`,
  }),

  fail: (b: BadgeRef, feedback: string, bookableFrom: number): Message => ({
    title: "Not cleared this time",
    body: `You didn't clear the ${badgeName(b)} interview. Your skill levels and Miles are unchanged. Your interviewer's feedback: "${feedback}" You can book again from ${fmtDay(bookableFrom)}.`,
  }),

  retake: (b: BadgeRef, feedback: string): Message => ({
    title: "Your interview needs a retake",
    body: `Your ${badgeName(b)} interview couldn't be assessed fully, so it doesn't count as an attempt. Your interviewer's note: "${feedback}" You can book a new slot right away.`,
  }),

  noShow: (b: BadgeRef, startsAt: number, bookableFrom: number): Message => ({
    title: "You missed your interview",
    body: `We didn't see you at your ${badgeName(b)} interview on ${fmtDayTime(startsAt)} IST. You can book again from ${fmtDay(bookableFrom)}. If you were there and something went wrong, tell GRIT support and the team will review it.`,
  }),

  nudge: (b: BadgeRef, eligibleAt: number, now: number): Message => ({
    title: "Your interview is still waiting",
    body: `You've been eligible for the ${badgeName(b)} interview for ${fmtGap(now - eligibleAt)} and haven't booked yet. It takes ${POLICY.slotMinutes} minutes. ${Math.max(0, daysBetween(now, POLICY.qualifierDeadline))} days are left to earn a badge for the Qualifier.`,
  }),

  blocked: (b: BadgeRef, cancelledStart: number | null): Message => ({
    title: "Your interview is on hold",
    body: `A contest attempt linked to your ${badgeName(b)} badge has been flagged for review. Booking is paused${cancelledStart ? ` and your interview on ${fmtDayTime(cancelledStart)} IST has been cancelled` : ""}. You'll get a message here as soon as the review closes.`,
  }),

  nullified: (b: BadgeRef): Message => ({
    title: `Your ${b.tier} badge has been nullified`,
    body: `A contest attempt linked to your ${badgeName(b)} badge was flagged for malpractice. The badge and its ${miles(b.bonusMiles)} bonus Miles have been removed from your profile. If you think this is a mistake, you can appeal through GRIT support.`,
  }),

  flagCleared: (b: BadgeRef, restoredBadge: boolean): Message => ({
    title: "Review closed. You're clear",
    body: restoredBadge
      ? `The review of your ${badgeName(b)} badge is closed with no action. Your badge and ${miles(b.bonusMiles)} bonus Miles are back on your profile.`
      : `The review linked to your ${badgeName(b)} badge is closed with no action. You can book your interview again.`,
  }),
};

/* -------------------------------------------------- the dashboard journey card */

export type Tone = "action" | "info" | "success" | "warning" | "danger" | "neutral";

export interface JourneyCopy extends Message {
  tone: Tone;
  eyebrow: string;
  cta?: "book" | "rebook" | "join" | "manage";
}

export interface JourneyContext {
  badge: BadgeRef;
  now: number;
  progress?: { cleared: number; total: number };
  booking?: { startsAt: number; endsAt: number; interviewer: string } | null;
  lastOutcome?: Outcome | null;
  lastFeedback?: string | null;
  lastStartsAt?: number | null;
  bookableFrom?: number | null;
  canChange?: boolean;
}

export function journeyCopy(state: JourneyState, c: JourneyContext): JourneyCopy {
  const b = c.badge;
  switch (state) {
    case "NOT_ELIGIBLE": {
      const p = c.progress ?? { cleared: 0, total: 0 };
      const left = p.total - p.cleared;
      return {
        tone: "neutral",
        eyebrow: "Skills pending",
        title: `${left} skill level${left === 1 ? "" : "s"} to go before your interview`,
        body: `You've cleared ${p.cleared} of ${p.total} skill levels for the ${b.tier} badge in ${b.track}. Clear the rest in GRIT Contests and the interview unlocks here automatically.`,
      };
    }
    case "ELIGIBLE":
      return { tone: "action", eyebrow: "Action needed", cta: "book", ...notify.eligible(b) };
    case "BOOKED": {
      const k = c.booking!;
      return {
        tone: "info",
        eyebrow: k.startsAt - c.now < 12 * 3_600_000 ? `In ${fmtGap(k.startsAt - c.now)}` : relDay(k.startsAt, c.now),
        cta: "manage",
        title: `Interview on ${fmtDayTime(k.startsAt)} IST`,
        body: `${fmtRange(k.startsAt, k.endsAt)} IST with ${k.interviewer}, online. The join link appears here ${POLICY.joinWindowMinutes} minutes before the start. ${
          c.canChange
            ? `You can reschedule once or cancel until ${fmtDayTime(k.startsAt - POLICY.changeCutoffHours * 3_600_000)}.`
            : "Changes are closed for this interview, so please join on time."
        }`,
      };
    }
    case "IN_PROGRESS": {
      const k = c.booking!;
      return {
        tone: "action",
        eyebrow: "Happening now",
        cta: "join",
        title: "Your interview has started",
        body: `${k.interviewer} is waiting for you. The interview runs until ${fmtTime(k.endsAt)} IST. If you don't join within ${POLICY.noShowGraceMinutes} minutes of the start, it may be marked as missed.`,
      };
    }
    case "AWAITING_RESULT":
      return {
        tone: "info",
        eyebrow: "Result pending",
        title: "Interview done. Your result is on its way",
        body: `${c.booking?.interviewer ?? "Your interviewer"} will record your result within ${POLICY.outcomeSlaHours} hours. It will show up here and in your messages. Nothing more is needed from you.`,
      };
    case "PASSED":
      return { tone: "success", eyebrow: "Badge earned", ...notify.pass(b) };
    case "COOLDOWN": {
      const from = c.bookableFrom ?? c.now;
      const base =
        c.lastOutcome === "no_show"
          ? notify.noShow(b, c.lastStartsAt ?? c.now, from)
          : notify.fail(b, c.lastFeedback ?? "", from);
      return { tone: "warning", eyebrow: `Rebook in ${fmtGap(from - c.now)}`, ...base };
    }
    case "RETAKE_READY":
      if (c.lastOutcome === "retake")
        return { tone: "action", eyebrow: "Action needed", cta: "rebook", ...notify.retake(b, c.lastFeedback ?? "") };
      return {
        tone: "action",
        eyebrow: "Action needed",
        cta: "rebook",
        title: "You can book your interview again",
        body:
          c.lastOutcome === "fail"
            ? `Your waiting period is over. Go through your interviewer's feedback, then pick a new slot for the ${badgeName(b)} interview: "${c.lastFeedback ?? ""}"`
            : `Your waiting period is over. Pick a new slot for the ${badgeName(b)} interview.`,
      };
    case "BLOCKED":
      return { tone: "danger", eyebrow: "Under review", ...notify.blocked(b, null) };
    case "NULLIFIED":
      return { tone: "danger", eyebrow: "Badge removed", ...notify.nullified(b) };
  }
}
