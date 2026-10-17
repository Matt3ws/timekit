import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from "@tanstack/react-query";
import { desc, eq, isNull, sql } from "drizzle-orm";
import { toast } from "sonner";
import { db } from "@/db/client";
import { customers, invoiceEntries, projects, tasks, timeEntries, type TimeEntry } from "@/db/schema";
import { newId } from "@/lib/ids";
import { invalidateTimeData, queryKeys } from "@/queries/keys";

export interface ActiveTimer {
  id: string;
  taskId: string;
  description: string | null;
  startedAt: number;
  taskTitle: string;
  projectId: string;
  projectTitle: string;
  customerId: string;
  customerName: string;
}

/** A time entry plus the invoice it is billed on (null while unbilled). */
export interface TimeEntryWithBilling extends TimeEntry {
  billedInvoiceId: string | null;
}

/**
 * Stops whatever is running, as ONE statement: duration is computed in SQL from
 * the stored start, so there is no read-then-write window.
 */
const stopRunningStatement = (now: number) =>
  db
    .update(timeEntries)
    .set({
      endedAt: now,
      durationSeconds: sql`max(0, cast(round((${now} - started_at) / 1000.0) as integer))`,
      updatedAt: now,
    })
    .where(isNull(timeEntries.endedAt));

/** Throws a readable error when the entry is on an invoice. */
const assertNotBilled = async (entryId: string): Promise<void> => {
  const billed = await db
    .select({ id: invoiceEntries.id })
    .from(invoiceEntries)
    .where(eq(invoiceEntries.timeEntryId, entryId))
    .limit(1);
  if (billed.length > 0) {
    throw new Error("This time is on an issued invoice and can't be changed");
  }
};

/** The single running entry, joined with its task, project and customer for display. */
export const useActiveTimer = (): UseQueryResult<ActiveTimer | null, Error> =>
  useQuery({
    queryKey: queryKeys.activeTimer,
    queryFn: async (): Promise<ActiveTimer | null> => {
      // Every result column needs a distinct name: the sqlite-proxy maps rows by
      // position from an object keyed by column name, so two "id"/"title"
      // columns collapse and shift every later value (see lessons.md).
      const rows = await db
        .select({
          id: sql<string>`time_entries.id`.as("at_entry_id"),
          taskId: sql<string>`time_entries.task_id`.as("at_task_id"),
          description: sql<string | null>`time_entries.description`.as("at_description"),
          startedAt: sql<number>`time_entries.started_at`.as("at_started_at"),
          taskTitle: sql<string>`tasks.title`.as("at_task_title"),
          projectId: sql<string>`projects.id`.as("at_project_id"),
          projectTitle: sql<string>`projects.title`.as("at_project_title"),
          customerId: sql<string>`customers.id`.as("at_customer_id"),
          customerName: sql<string>`coalesce(customers.company_name, customers.name)`.as("at_customer_name"),
        })
        .from(timeEntries)
        .innerJoin(tasks, eq(timeEntries.taskId, tasks.id))
        .innerJoin(projects, eq(tasks.projectId, projects.id))
        .innerJoin(customers, eq(projects.customerId, customers.id))
        .where(isNull(timeEntries.endedAt))
        .limit(1);
      return rows[0] ?? null;
    },
  });

/** A task's entries, newest first, each flagged with the invoice it is billed on. */
export const useTimeEntries = (taskId: string | undefined): UseQueryResult<TimeEntryWithBilling[], Error> =>
  useQuery({
    queryKey: [...queryKeys.timeEntries, taskId],
    enabled: Boolean(taskId),
    queryFn: (): Promise<TimeEntryWithBilling[]> =>
      db
        .select({
          id: timeEntries.id,
          taskId: timeEntries.taskId,
          description: timeEntries.description,
          startedAt: timeEntries.startedAt,
          endedAt: timeEntries.endedAt,
          durationSeconds: timeEntries.durationSeconds,
          resumedFromId: timeEntries.resumedFromId,
          isManual: timeEntries.isManual,
          createdAt: timeEntries.createdAt,
          updatedAt: timeEntries.updatedAt,
          billedInvoiceId: sql<string | null>`(
            select ie.invoice_id from invoice_entries ie where ie.time_entry_id = time_entries.id
          )`.as("billed_invoice_id"),
        })
        .from(timeEntries)
        .where(eq(timeEntries.taskId, taskId ?? ""))
        .orderBy(desc(timeEntries.startedAt)),
  });

export interface StartTimerInput {
  taskId: string;
  description?: string;
}

/** Stops the running timer (if any) and starts a new one, in one transaction. */
export const useStartTimer = (): UseMutationResult<string, Error, StartTimerInput> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, description }: StartTimerInput): Promise<string> => {
      const now = Date.now();
      const id = newId();
      await db.batch([
        stopRunningStatement(now),
        db.insert(timeEntries).values({ id, taskId, description: description ?? null, startedAt: now, endedAt: null }),
      ]);
      return id;
    },
    onSuccess: (): Promise<void> => invalidateTimeData(queryClient),
    onError: (): void => {
      toast.error("Couldn't start the timer");
    },
  });
};

export const useStopTimer = (): UseMutationResult<void, Error, void> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<void> => {
      await stopRunningStatement(Date.now());
    },
    onSuccess: (): Promise<void> => invalidateTimeData(queryClient),
    onError: (): void => {
      toast.error("Couldn't stop the timer");
    },
  });
};

export interface ResumeTimerInput {
  entryId: string;
}

/** Resume an entry: a new running entry on the same task, chained via resumedFromId to the chain root. */
export const useResumeTimer = (): UseMutationResult<string, Error, ResumeTimerInput> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ entryId }: ResumeTimerInput): Promise<string> => {
      const [origin] = await db.select().from(timeEntries).where(eq(timeEntries.id, entryId)).limit(1);
      if (!origin) {
        throw new Error("Entry not found");
      }
      const now = Date.now();
      const id = newId();
      await db.batch([
        stopRunningStatement(now),
        db.insert(timeEntries).values({
          id,
          taskId: origin.taskId,
          description: origin.description,
          resumedFromId: origin.resumedFromId ?? origin.id,
          startedAt: now,
          endedAt: null,
        }),
      ]);
      return id;
    },
    onSuccess: (): Promise<void> => invalidateTimeData(queryClient),
    onError: (): void => {
      toast.error("Couldn't resume the timer");
    },
  });
};

export interface EditTimeEntryInput {
  id: string;
  startedAt: number;
  /** null keeps a running entry running. */
  endedAt: number | null;
  description?: string | null;
}

/** Edit an entry. Duration is re-derived from start/end; a running entry stays running. */
export const useEditTimeEntry = (): UseMutationResult<void, Error, EditTimeEntryInput> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, startedAt, endedAt, description }: EditTimeEntryInput): Promise<void> => {
      await assertNotBilled(id);
      if (endedAt !== null && endedAt <= startedAt) {
        throw new Error("The end time must be after the start time");
      }
      const durationSeconds = endedAt === null ? null : Math.round((endedAt - startedAt) / 1000);
      await db
        .update(timeEntries)
        .set({ startedAt, endedAt, description, durationSeconds, updatedAt: Date.now() })
        .where(eq(timeEntries.id, id));
    },
    onSuccess: async (): Promise<void> => {
      await invalidateTimeData(queryClient);
      toast.success("Time entry updated");
    },
    onError: (error: Error): void => {
      toast.error(error.message || "Couldn't update the time entry");
    },
  });
};

export interface AddManualEntryInput {
  taskId: string;
  startedAt: number;
  endedAt: number;
  description?: string | null;
}

export const useAddManualEntry = (): UseMutationResult<void, Error, AddManualEntryInput> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, startedAt, endedAt, description }: AddManualEntryInput): Promise<void> => {
      if (endedAt <= startedAt) {
        throw new Error("The duration must be more than zero");
      }
      await db.insert(timeEntries).values({
        id: newId(),
        taskId,
        description: description ?? null,
        startedAt,
        endedAt,
        durationSeconds: Math.round((endedAt - startedAt) / 1000),
        isManual: true,
      });
    },
    onSuccess: async (): Promise<void> => {
      await invalidateTimeData(queryClient);
      toast.success("Time added");
    },
    onError: (error: Error): void => {
      toast.error(error.message || "Couldn't add time");
    },
  });
};

export interface DeleteTimeEntryInput {
  id: string;
}

export const useDeleteTimeEntry = (): UseMutationResult<void, Error, DeleteTimeEntryInput> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: DeleteTimeEntryInput): Promise<void> => {
      await assertNotBilled(id);
      await db.delete(timeEntries).where(eq(timeEntries.id, id));
    },
    onSuccess: async (): Promise<void> => {
      await invalidateTimeData(queryClient);
      toast.success("Time entry deleted");
    },
    onError: (error: Error): void => {
      toast.error(error.message || "Couldn't delete the time entry");
    },
  });
};
