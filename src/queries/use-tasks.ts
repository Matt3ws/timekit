import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from "@tanstack/react-query";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { toast } from "sonner";
import { db } from "@/db/client";
import { tasks, timeEntries, type Task, type NewTask } from "@/db/schema";
import { newId } from "@/lib/ids";
import { invalidateNames, invalidateTimeData, queryKeys } from "@/queries/keys";

export interface TaskWithTime extends Task {
  /** Sum of stopped entries' durationSeconds for this task. */
  trackedSeconds: number;
  /** Stopped time not yet on any invoice. */
  unbilledSeconds: number;
  /** Stopped time that is on an invoice. */
  billedSeconds: number;
}

/** A foreign-key failure on delete means billed time entries are in the way. */
export const isBilledTimeError = (error: unknown): boolean =>
  String(error).includes("FOREIGN KEY constraint failed");

export const useTasks = (projectId: string | undefined): UseQueryResult<TaskWithTime[], Error> =>
  useQuery({
    queryKey: [...queryKeys.tasks, projectId],
    enabled: Boolean(projectId),
    queryFn: (): Promise<TaskWithTime[]> =>
      db
        .select({
          id: tasks.id,
          projectId: tasks.projectId,
          title: tasks.title,
          description: tasks.description,
          status: tasks.status,
          position: tasks.position,
          completedAt: tasks.completedAt,
          createdAt: tasks.createdAt,
          updatedAt: tasks.updatedAt,
          // Explicit aliases: Drizzle renders interpolated columns unqualified
          // in raw sql``, which made the correlated `tasks.id` collide with
          // `time_entries.id` and silently sum to 0. Qualify everything by hand.
          trackedSeconds: sql<number>`coalesce((
            select sum(te.duration_seconds)
            from time_entries te
            where te.task_id = tasks.id
          ), 0)`,
          unbilledSeconds: sql<number>`coalesce((
            select sum(te.duration_seconds)
            from time_entries te
            where te.task_id = tasks.id
              and te.ended_at is not null
              and not exists (select 1 from invoice_entries ie where ie.time_entry_id = te.id)
          ), 0)`,
          billedSeconds: sql<number>`coalesce((
            select sum(te.duration_seconds)
            from time_entries te
            join invoice_entries ie on ie.time_entry_id = te.id
            where te.task_id = tasks.id
          ), 0)`,
        })
        .from(tasks)
        .where(eq(tasks.projectId, projectId ?? ""))
        .orderBy(asc(tasks.position), asc(tasks.createdAt)),
  });

export const useCreateTask = (): UseMutationResult<Task, Error, NewTask> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (values: NewTask): Promise<Task> => {
      const [created] = await db
        .insert(tasks)
        .values({ ...values, id: values.id ?? newId() })
        .returning();
      return created;
    },
    onSuccess: async (): Promise<void> => {
      await invalidateTimeData(queryClient);
      toast.success("Task added");
    },
    onError: (): void => {
      toast.error("Couldn't add task");
    },
  });
};

export interface UpdateTaskInput extends Partial<NewTask> {
  id: string;
  projectId: string;
}

export const useUpdateTask = (): UseMutationResult<void, Error, UpdateTaskInput> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, projectId: _projectId, ...patch }: UpdateTaskInput): Promise<void> => {
      const now = Date.now();
      const completedAt = patch.status === "done" ? (patch.completedAt ?? now) : patch.status ? null : undefined;
      const update = db
        .update(tasks)
        .set({ ...patch, completedAt, updatedAt: now })
        .where(eq(tasks.id, id));
      if (patch.status !== "done") {
        await update;
        return;
      }
      // Finishing a task also stops its timer, if it is the one running.
      await db.batch([
        update,
        db
          .update(timeEntries)
          .set({
            endedAt: now,
            durationSeconds: sql`max(0, cast(round((${now} - started_at) / 1000.0) as integer))`,
            updatedAt: now,
          })
          .where(and(eq(timeEntries.taskId, id), isNull(timeEntries.endedAt))),
      ]);
    },
    onSuccess: async (_data, variables): Promise<void> => {
      // Title and status show in the timer, the invoice builder and on project pages.
      await (variables.title !== undefined || variables.status === "done"
        ? Promise.all([invalidateNames(queryClient), invalidateTimeData(queryClient)])
        : queryClient.invalidateQueries({ queryKey: [...queryKeys.tasks, variables.projectId] }));
    },
    onError: (): void => {
      toast.error("Couldn't update task");
    },
  });
};

export const useDeleteTask = (): UseMutationResult<void, Error, { id: string; projectId: string }> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; projectId: string }): Promise<void> => {
      // One statement: foreign keys cascade to entries and links, and the
      // whole delete fails if any entry is on an issued invoice.
      await db.delete(tasks).where(eq(tasks.id, id));
    },
    onSuccess: async (): Promise<void> => {
      await invalidateTimeData(queryClient);
      toast.success("Task deleted");
    },
    onError: (error: Error): void => {
      toast.error(
        isBilledTimeError(error)
          ? "This task has invoiced time, so it can't be deleted. Mark it done instead."
          : "Couldn't delete task",
      );
    },
  });
};
