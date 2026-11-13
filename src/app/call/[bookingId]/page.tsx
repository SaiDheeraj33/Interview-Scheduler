/**
 * Stand-in for the video call. In production the join button opens the real meeting
 * link (Google Meet, Zoom...) stored on the booking; in the prototype there is no
 * video provider, so this page shows what joining looks like instead of a dead link.
 * Like a real meeting link, anyone with the URL can open it; it shows names only.
 */
import { eq } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CallRoom } from "@/components/call-room";
import { db } from "@/db/client";
import { badges, bookings, candidacies, users } from "@/db/schema";
import { getClockOffset, getNow } from "@/server/clock";
import { getSession, homeFor } from "@/server/session";

export const metadata: Metadata = { title: "Interview call" };
export const dynamic = "force-dynamic";

export default async function CallPage({ params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params;
  const student = alias(users, "student");
  const interviewer = alias(users, "interviewer");
  const [row] = await db
    .select({ b: bookings, badge: badges, student: student.name, interviewer: interviewer.name })
    .from(bookings)
    .innerJoin(candidacies, eq(candidacies.id, bookings.candidacyId))
    .innerJoin(badges, eq(badges.id, candidacies.badgeId))
    .innerJoin(student, eq(student.id, bookings.studentId))
    .innerJoin(interviewer, eq(interviewer.id, bookings.interviewerId))
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!row) notFound();

  const [me, now, offset] = await Promise.all([getSession(), getNow(), getClockOffset()]);
  // Whose camera is "you": the signed-in participant, otherwise the interviewer (e.g. from /live).
  const youAreStudent = me?.id === row.b.studentId;

  return (
    <CallRoom
      title={`${row.badge.tier} · ${row.badge.track}`}
      you={youAreStudent ? row.student : row.interviewer}
      them={youAreStudent ? row.interviewer : row.student}
      themRole={youAreStudent ? "Interviewer" : "Student"}
      startsAt={row.b.startsAt}
      endsAt={row.b.endsAt}
      cancelled={row.b.status === "cancelled"}
      serverNow={now}
      offset={offset}
      backHref={me ? homeFor(me.role) : "/live"}
    />
  );
}
