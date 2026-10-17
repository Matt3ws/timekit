/** Tracked time is stored in seconds; estimates in minutes. These format for display. */

/** Seconds elapsed between a start timestamp (ms) and now (ms). Never negative. */
export const elapsedSeconds = (startedAtMs: number, nowMs: number = Date.now()): number =>
  Math.max(0, Math.round((nowMs - startedAtMs) / 1000));

/** Compact human duration, e.g. 9015 → "2h 30m". Shows minutes only under an hour. */
export const formatDuration = (totalSeconds: number): string => {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours === 0) {
    return `${minutes}m`;
  }
  return `${hours}h ${minutes}m`;
};

/** Stopwatch clock, e.g. 9015 → "02:30:15". */
export const formatClock = (totalSeconds: number): string => {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const hh = String(Math.floor(seconds / 3600)).padStart(2, "0");
  const mm = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
};


/**
 * Parse a typed duration into seconds. Accepts `1:30`, `1,5` / `1.5` (hours),
 * `90m`, `1h 30m`, `1t 30m` (Danish "timer") and a bare number of hours.
 * Returns null for anything else, or for zero.
 */
export const parseDuration = (input: string): number | null => {
  const text = input.trim().toLowerCase().replace(/\s+/g, " ");
  if (!text) {
    return null;
  }

  const clock = /^(\d{1,3}):([0-5]\d)$/.exec(text);
  if (clock) {
    return positive(Number(clock[1]) * 3600 + Number(clock[2]) * 60);
  }

  const units = /^(?:(\d+(?:[.,]\d+)?) ?(?:h|t|timer|time|hours?))? ?(?:(\d+) ?(?:m|min|minutter|minutes?))?$/.exec(text);
  if (units && (units[1] || units[2])) {
    const hours = units[1] ? Number(units[1].replace(",", ".")) : 0;
    const minutes = units[2] ? Number(units[2]) : 0;
    return positive(Math.round(hours * 3600 + minutes * 60));
  }

  const hoursOnly = /^\d+(?:[.,]\d+)?$/.exec(text);
  if (hoursOnly) {
    return positive(Math.round(Number(text.replace(",", ".")) * 3600));
  }
  return null;
};

const positive = (seconds: number): number | null => (seconds > 0 ? seconds : null);
