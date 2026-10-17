import { useNow } from "@/hooks/use-now";
import { elapsedSeconds, formatClock, formatDuration } from "@/lib/duration";

interface LiveDurationProps {
  /** When the running timer started (epoch ms). */
  startedAt: number;
  /** Seconds to add on top (stopped time already tracked). */
  baseSeconds?: number;
  /** "clock" → 01:24:07, "short" → 1h 24m. */
  format?: "clock" | "short";
  className?: string;
}

/**
 * A ticking duration. It re-renders only itself every second, so a running
 * timer never re-renders the page or list around it.
 */
export const LiveDuration = ({
  startedAt,
  baseSeconds = 0,
  format = "clock",
  className,
}: LiveDurationProps): React.JSX.Element => {
  const now = useNow(true);
  const seconds = baseSeconds + elapsedSeconds(startedAt, now);
  return <span className={className}>{format === "clock" ? formatClock(seconds) : formatDuration(seconds)}</span>;
};
