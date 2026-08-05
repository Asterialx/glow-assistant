import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../../lib/utils";

interface Props {
  src: string;
  className?: string;
  compact?: boolean;
}

function fmt(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Themed voice note mini-player (play/pause + seek). */
export function VoiceNotePlayer({ src, className, compact }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const a = new Audio(src);
    a.preload = "metadata";
    audioRef.current = a;

    const onMeta = () => {
      setDur(Number.isFinite(a.duration) ? a.duration : 0);
      setReady(true);
    };
    const onTime = () => setT(a.currentTime);
    const onEnd = () => {
      setPlaying(false);
      setT(0);
      a.currentTime = 0;
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);

    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("durationchange", onMeta);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("ended", onEnd);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);

    return () => {
      a.pause();
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("durationchange", onMeta);
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("ended", onEnd);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.src = "";
      audioRef.current = null;
    };
  }, [src]);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) void a.play().catch(() => setPlaying(false));
    else a.pause();
  };

  const seek = (value: number) => {
    const a = audioRef.current;
    if (!a || !dur) return;
    a.currentTime = value;
    setT(value);
  };

  const pct = dur > 0 ? Math.min(100, (t / dur) * 100) : 0;

  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)]",
        compact ? "px-2.5 py-2" : "px-3 py-2.5",
        className,
      )}
    >
      <button
        type="button"
        onClick={toggle}
        disabled={!ready && dur === 0}
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
          "bg-[var(--accent)] text-white shadow-sm transition-opacity hover:opacity-90",
          "disabled:opacity-40",
        )}
        aria-label={playing ? "Pause" : "Play"}
      >
        {playing ? (
          <Pause size={15} strokeWidth={2.2} fill="currentColor" />
        ) : (
          <Play size={15} strokeWidth={2.2} fill="currentColor" className="ml-0.5" />
        )}
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <input
          type="range"
          min={0}
          max={dur || 0}
          step={0.05}
          value={Math.min(t, dur || 0)}
          disabled={!dur}
          onChange={(e) => seek(Number(e.target.value))}
          className="glow-audio-seek w-full"
          style={{ ["--seek-pct" as string]: `${pct}%` }}
          aria-label="Seek"
        />
        <div className="flex justify-between text-[11px] tabular-nums text-[var(--fg-faint)]">
          <span>{fmt(t)}</span>
          <span>{fmt(dur)}</span>
        </div>
      </div>
    </div>
  );
}
