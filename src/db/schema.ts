import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { CandidacyStatus, Outcome } from "@/domain/journey";

/** All timestamps are UTC epoch milliseconds. Display is always IST. */
const ts = (name: string) => integer(name);

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  role: text("role").$type<"student" | "interviewer" | "admin">().notNull(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  campus: text("campus"),
  /** Miles earned from contests; badge bonus Miles are added on top when a badge is held. */
  baseMiles: integer("base_miles").notNull().default(0),
});

export const badges = sqliteTable("badges", {
  id: text("id").primaryKey(),
  track: text("track").notNull(),
  tier: text("tier").notNull(),
  bonusMiles: integer("bonus_miles").notNull(),
});

export const badgeRequirements = sqliteTable(
  "badge_requirements",
  {
    badgeId: text("badge_id").notNull().references(() => badges.id),
    skill: text("skill").notNull(),
    level: integer("level").notNull(),
  },
  (t) => [primaryKey({ columns: [t.badgeId, t.skill] })],
);

/** Owned by the contest system in production; mirrored here so eligibility can be shown. */
export const skillClearances = sqliteTable(
  "skill_clearances",
  {
    studentId: text("student_id").notNull().references(() => users.id),
    skill: text("skill").notNull(),
    level: integer("level").notNull(),
    result: text("result").$type<"gold" | "silver">().notNull(),
    clearedAt: ts("cleared_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.studentId, t.skill, t.level] })],
);

/** One row per student per badge: the interview journey. Created when the last skill is cleared. */
export const candidacies = sqliteTable(
  "candidacies",
  {
    id: text("id").primaryKey(),
    studentId: text("student_id").notNull().references(() => users.id),
    badgeId: text("badge_id").notNull().references(() => badges.id),
    status: text("status").$type<CandidacyStatus>().notNull().default("eligible"),
    eligibleAt: ts("eligible_at").notNull(),
    /** Null = bookable now. Set by a fail or no-show cooldown. */
    bookableFrom: ts("bookable_from"),
    lastOutcome: text("last_outcome").$type<Outcome>(),
    attemptCount: integer("attempt_count").notNull().default(0),
    noShowCount: integer("no_show_count").notNull().default(0),
    reschedulesUsed: integer("reschedules_used").notNull().default(0),
    awardedAt: ts("awarded_at"),
    statusBeforeFlag: text("status_before_flag").$type<CandidacyStatus>(),
    flagReason: text("flag_reason"),
    flaggedAt: ts("flagged_at"),
    lastNudgedAt: ts("last_nudged_at"),
  },
  (t) => [
    uniqueIndex("candidacies_student_badge").on(t.studentId, t.badgeId),
    index("candidacies_status").on(t.status),
  ],
);

/**
 * A 30-minute window an interviewer has offered.
 * Bookable when it is active and no scheduled booking points at it.
 * Withdrawn slots are deactivated, not deleted, so past bookings keep their reference.
 */
export const slots = sqliteTable(
  "slots",
  {
    id: text("id").primaryKey(),
    interviewerId: text("interviewer_id").notNull().references(() => users.id),
    startsAt: ts("starts_at").notNull(),
    endsAt: ts("ends_at").notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: ts("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("slots_interviewer_start").on(t.interviewerId, t.startsAt),
    index("slots_start").on(t.startsAt),
  ],
);

export const bookings = sqliteTable(
  "bookings",
  {
    id: text("id").primaryKey(),
    candidacyId: text("candidacy_id").notNull().references(() => candidacies.id),
    slotId: text("slot_id").notNull().references(() => slots.id),
    studentId: text("student_id").notNull().references(() => users.id),
    interviewerId: text("interviewer_id").notNull().references(() => users.id),
    /** Copied from the slot so history stays readable if the booking is reassigned. */
    startsAt: ts("starts_at").notNull(),
    endsAt: ts("ends_at").notNull(),
    attemptNo: integer("attempt_no").notNull(),
    status: text("status").$type<"scheduled" | "completed" | "cancelled">().notNull().default("scheduled"),
    cancelledBy: text("cancelled_by").$type<"student" | "team" | "system">(),
    cancelReason: text("cancel_reason"),
    outcome: text("outcome").$type<Outcome>(),
    /** Shown to the student. */
    studentFeedback: text("student_feedback"),
    /** Never shown to the student. */
    internalNotes: text("internal_notes"),
    recordedBy: text("recorded_by").references(() => users.id),
    recordedAt: ts("recorded_at"),
    meetingUrl: text("meeting_url").notNull(),
    createdAt: ts("created_at").notNull(),
  },
  (t) => [
    // The two invariants that make double-booking impossible, whatever the UI does.
    uniqueIndex("bookings_one_live_per_slot").on(t.slotId).where(sql`status = 'scheduled'`),
    uniqueIndex("bookings_one_live_per_candidacy").on(t.candidacyId).where(sql`status = 'scheduled'`),
    index("bookings_interviewer_start").on(t.interviewerId, t.startsAt),
    index("bookings_student").on(t.studentId),
  ],
);

/**
 * The interviewer's scorecard for one interview: one row per rubric criterion.
 * The label is copied so the record still reads correctly if the rubric changes later.
 */
export const bookingScores = sqliteTable(
  "booking_scores",
  {
    bookingId: text("booking_id").notNull().references(() => bookings.id),
    criterion: text("criterion").notNull(),
    label: text("label").notNull(),
    score: integer("score").notNull(),
  },
  (t) => [primaryKey({ columns: [t.bookingId, t.criterion] })],
);

/** Append-only audit trail. Nothing here is ever updated or deleted. */
export const events = sqliteTable(
  "events",
  {
    id: text("id").primaryKey(),
    candidacyId: text("candidacy_id").notNull().references(() => candidacies.id),
    actorId: text("actor_id").references(() => users.id),
    type: text("type").$type<EventType>().notNull(),
    summary: text("summary").notNull(),
    createdAt: ts("created_at").notNull(),
  },
  (t) => [index("events_candidacy").on(t.candidacyId, t.createdAt)],
);

export type EventType =
  | "eligible"
  | "booked"
  | "rescheduled"
  | "cancelled_by_student"
  | "cancelled_by_team"
  | "reassigned"
  | "outcome_pass"
  | "outcome_fail"
  | "outcome_retake"
  | "outcome_no_show"
  | "flagged"
  | "flag_cleared"
  | "nudged";

/** In-app messages. In production the same rows fan out to email / WhatsApp. */
export const notifications = sqliteTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    candidacyId: text("candidacy_id").references(() => candidacies.id),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    createdAt: ts("created_at").notNull(),
  },
  (t) => [index("notifications_user").on(t.userId, t.createdAt)],
);

export type User = typeof users.$inferSelect;
export type Badge = typeof badges.$inferSelect;
export type Candidacy = typeof candidacies.$inferSelect;
export type Slot = typeof slots.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
export type EventRow = typeof events.$inferSelect;
export type BookingScore = typeof bookingScores.$inferSelect;
export type NotificationRow = typeof notifications.$inferSelect;
