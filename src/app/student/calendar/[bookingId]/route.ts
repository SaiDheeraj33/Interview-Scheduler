/**
 * "Add to calendar": a standard .ics file for the student's own booked interview.
 * Works with Google Calendar, Outlook and Apple Calendar without any integration.
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { badges, bookings, candidacies, users } from "@/db/schema";
import { getSession } from "@/server/session";

const stamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const escape = (s: string) => s.replace(/\\/g, "\\\\").replace(/[,;]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");

export async function GET(req: Request, { params }: { params: Promise<{ bookingId: string }> }) {
  const me = await getSession();
  if (!me || me.role !== "student") return new Response("Sign in as the student to download this.", { status: 401 });
  const { bookingId } = await params;
  const [row] = await db
    .select({ b: bookings, badge: badges, interviewer: users.name })
    .from(bookings)
    .innerJoin(candidacies, eq(candidacies.id, bookings.candidacyId))
    .innerJoin(badges, eq(badges.id, candidacies.badgeId))
    .innerJoin(users, eq(users.id, bookings.interviewerId))
    .where(and(eq(bookings.id, bookingId), eq(bookings.studentId, me.id), eq(bookings.status, "scheduled")))
    .limit(1);
  if (!row) return new Response("Interview not found.", { status: 404 });

  // Stored links may be relative to this site (the demo call page); calendars need an absolute URL.
  const joinUrl = new URL(row.b.meetingUrl, req.url).toString();
  const title = `GRIT ${row.badge.tier} interview · ${row.badge.track}`;
  const body = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//NIAT//GRIT Interviews//EN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${row.b.id}@grit-interviews`,
    `DTSTAMP:${stamp(Date.now())}`,
    `DTSTART:${stamp(row.b.startsAt)}`,
    `DTEND:${stamp(row.b.endsAt)}`,
    `SUMMARY:${escape(title)}`,
    `DESCRIPTION:${escape(`Level Clearance Interview with ${row.interviewer}. Join: ${joinUrl}\nThe join link also appears on your GRIT dashboard 10 minutes before the start.`)}`,
    `LOCATION:${escape(joinUrl)}`,
    `URL:${joinUrl}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT30M",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escape(title)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="grit-interview.ics"`,
      "Cache-Control": "private, no-store",
    },
  });
}
