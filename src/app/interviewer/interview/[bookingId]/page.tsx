import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LiveRefresh } from "@/components/client";
import { RoomView } from "@/components/room";
import { AppShell } from "@/components/shell";
import { getClockOffset, getNow } from "@/server/clock";
import { getInterviewRoom } from "@/server/queries";
import { requireRole } from "@/server/session";

export const metadata: Metadata = { title: "Interview room" };
export const dynamic = "force-dynamic";

export default async function InterviewRoomPage({ params }: { params: Promise<{ bookingId: string }> }) {
  const user = await requireRole("interviewer", "admin");
  const { bookingId } = await params;
  const [now, offset, roomData] = await Promise.all([getNow(), getClockOffset(), getInterviewRoom(bookingId, user)]);
  if (!roomData) notFound();

  return (
    <AppShell user={user} active={user.role === "interviewer" ? "/interviewer" : "/team"}>
      <LiveRefresh every={20000} />
      <Link href={user.role === "interviewer" ? "/interviewer" : "/team"} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg text-sm font-semibold text-muted hover:text-ink">
        <ArrowLeft aria-hidden className="size-4" /> {user.role === "interviewer" ? "Schedule" : "Dashboard"}
      </Link>
      <div className="mt-4">
        <RoomView room={roomData} now={now} offset={offset} canRelease={user.role === "interviewer"} />
      </div>
    </AppShell>
  );
}
