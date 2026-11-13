"use client";

/**
 * A simulated video call: two tiles, a timer and the usual controls. It exists so the
 * prototype's "Join" buttons land somewhere real; production opens the meeting link.
 */
import { Mic, MicOff, PhoneOff, Video, VideoOff } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { fmtRange } from "@/lib/time";
import { useNow } from "./client";
import { Avatar, cn } from "./ui";

function clock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function CallRoom(props: {
  title: string;
  you: string;
  them: string;
  themRole: string;
  startsAt: number;
  endsAt: number;
  cancelled: boolean;
  serverNow: number;
  offset: number;
  backHref: string;
}) {
  const now = useNow(props.serverNow, props.offset);
  const [mic, setMic] = useState(true);
  const [cam, setCam] = useState(true);
  const [left, setLeft] = useState(false);

  const status = props.cancelled
    ? "This interview was cancelled."
    : now < props.startsAt
      ? `Starts in ${clock(props.startsAt - now)}`
      : now < props.endsAt
        ? `${clock(now - props.startsAt)} elapsed · ${clock(props.endsAt - now)} left`
        : "Scheduled time is over";

  const leave = () => {
    setLeft(true);
    // Opened in a new tab from the dashboard: close it; if the browser refuses, the link below remains.
    window.close();
  };

  if (left) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[#141210] px-4 text-center text-white">
        <p className="font-display text-3xl">You left the call</p>
        <Link href={props.backHref} className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-[#141210]">
          Back to dashboard
        </Link>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col bg-[#141210] text-white">
      <header className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">Level Clearance Interview · {props.title}</p>
          <p className="text-xs text-white/60">
            {fmtRange(props.startsAt, props.endsAt)} IST · <span className="tabular-nums">{status}</span>
          </p>
        </div>
        <p className="rounded-full bg-white/10 px-3 py-1 text-xs text-white/70">Demo stand-in for the video call</p>
      </header>

      <div className="grid flex-1 gap-3 px-4 pb-4 sm:grid-cols-2 sm:px-6">
        <Tile name={props.them} label={props.themRole} on muted={false} />
        <Tile name={props.you} label="You" on={cam} muted={!mic} />
      </div>

      <footer className="flex items-center justify-center gap-3 pb-6">
        <Control label={mic ? "Mute microphone" : "Unmute microphone"} active={!mic} onClick={() => setMic((v) => !v)}>
          {mic ? <Mic aria-hidden className="size-5" /> : <MicOff aria-hidden className="size-5" />}
        </Control>
        <Control label={cam ? "Turn camera off" : "Turn camera on"} active={!cam} onClick={() => setCam((v) => !v)}>
          {cam ? <Video aria-hidden className="size-5" /> : <VideoOff aria-hidden className="size-5" />}
        </Control>
        <button
          type="button"
          onClick={leave}
          className="flex h-12 items-center gap-2 rounded-full bg-[#dc2626] px-5 text-sm font-semibold hover:bg-[#b91c1c] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <PhoneOff aria-hidden className="size-5" /> Leave
        </button>
      </footer>
    </main>
  );
}

function Tile({ name, label, on, muted }: { name: string; label: string; on: boolean; muted: boolean }) {
  return (
    <div className="relative flex min-h-56 items-center justify-center overflow-hidden rounded-2xl bg-[#26221e]">
      <div className={cn("transition-opacity", on ? "opacity-100" : "opacity-40")}>
        <Avatar name={name} size="lg" className="size-24 text-3xl" />
      </div>
      <p className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-lg bg-black/50 px-2.5 py-1 text-xs font-medium">
        {muted && <MicOff aria-label="Muted" className="size-3.5" />}
        {name} · {label}
      </p>
      {!on && <p className="absolute top-3 right-3 text-xs text-white/60">Camera off</p>}
    </div>
  );
}

function Control({ label, active, onClick, children }: { label: string; active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "flex size-12 items-center justify-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
        active ? "bg-white text-[#141210]" : "bg-white/10 hover:bg-white/20",
      )}
    >
      {children}
    </button>
  );
}
