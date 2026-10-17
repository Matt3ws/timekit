import { describe, expect, it } from "vitest";
import { elapsedSeconds, formatClock, formatDuration, parseDuration } from "@/lib/duration";

describe("parseDuration", () => {
  it.each([
    ["1:30", 5400],
    ["0:45", 2700],
    ["1,5", 5400],
    ["1.5", 5400],
    ["2", 7200],
    ["90m", 5400],
    ["90 min", 5400],
    ["1h 30m", 5400],
    ["1h30m", 5400],
    ["1t 30m", 5400],
    ["1,5t", 5400],
    ["2 timer", 7200],
    ["45 minutter", 2700],
  ])("%s → %i s", (input, expected) => {
    expect(parseDuration(input)).toBe(expected);
  });

  it.each(["", "0", "0:00", "1:75", "abc", "1h 30", "-1"])("rejects %j", (input) => {
    expect(parseDuration(input)).toBeNull();
  });
});

describe("formatting", () => {
  it("formats durations and clocks", () => {
    expect(formatDuration(9015)).toBe("2h 30m");
    expect(formatDuration(600)).toBe("10m");
    expect(formatClock(9015)).toBe("02:30:15");
  });

  it("never returns negative elapsed time", () => {
    expect(elapsedSeconds(2000, 1000)).toBe(0);
    expect(elapsedSeconds(1000, 61000)).toBe(60);
  });
});
