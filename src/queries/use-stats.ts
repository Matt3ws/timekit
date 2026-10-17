import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { and, gte, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { timeEntries } from "@/db/schema";
import { queryKeys } from "@/queries/keys";

const startOfToday = (): number => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.getTime();
};

const startOfWeek = (): number => {
  const now = new Date();
  const day = (now.getDay() + 6) % 7; // Monday = 0
  now.setHours(0, 0, 0, 0);
  now.setDate(now.getDate() - day);
  return now.getTime();
};

export interface TrackedTotals {
  /** Seconds tracked since midnight, stopped entries only. */
  todaySeconds: number;
  /** Seconds tracked since Monday, stopped entries only. */
  weekSeconds: number;
  /**
   * Start of the running timer when it began today / this week, so the UI can
   * add the live elapsed time on top without refetching every second.
   */
  runningStartedAt: number | null;
}

/** Today's and this week's tracked time (Monday start). */
export const useTrackedTotals = (): UseQueryResult<TrackedTotals, Error> =>
  useQuery({
    queryKey: [...queryKeys.stats, "totals"],
    queryFn: async (): Promise<TrackedTotals> => {
      const today = startOfToday();
      const week = startOfWeek();
      const [row] = await db
        .select({
          today: sql<number>`coalesce(sum(case when time_entries.started_at >= ${today} then time_entries.duration_seconds end), 0)`.as("today_seconds"),
          week: sql<number>`coalesce(sum(time_entries.duration_seconds), 0)`.as("week_seconds"),
          running: sql<number | null>`(select te.started_at from time_entries te where te.ended_at is null)`.as("running_started_at"),
        })
        .from(timeEntries)
        .where(and(gte(timeEntries.startedAt, week), isNotNull(timeEntries.endedAt)));
      return {
        todaySeconds: Number(row?.today ?? 0),
        weekSeconds: Number(row?.week ?? 0),
        runningStartedAt: row?.running == null ? null : Number(row.running),
      };
    },
  });
