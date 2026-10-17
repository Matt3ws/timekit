import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from "@tanstack/react-query";
import { asc, eq } from "drizzle-orm";
import { toast } from "sonner";
import { db } from "@/db/client";
import { taskLinks, type TaskLink } from "@/db/schema";
import { newId } from "@/lib/ids";

/** Titled links attached to a task, oldest first. */
export const useTaskLinks = (taskId: string | undefined): UseQueryResult<TaskLink[], Error> =>
  useQuery({
    queryKey: ["task-links", taskId],
    enabled: Boolean(taskId),
    queryFn: (): Promise<TaskLink[]> =>
      db
        .select()
        .from(taskLinks)
        .where(eq(taskLinks.taskId, taskId!))
        .orderBy(asc(taskLinks.position), asc(taskLinks.createdAt)),
  });

export interface CreateTaskLinkInput {
  taskId: string;
  title: string;
  url: string;
}

export const useCreateTaskLink = (): UseMutationResult<void, Error, CreateTaskLinkInput> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, title, url }: CreateTaskLinkInput): Promise<void> => {
      await db.insert(taskLinks).values({ id: newId(), taskId, title, url });
    },
    onSuccess: async (_data, variables): Promise<void> => {
      await queryClient.invalidateQueries({ queryKey: ["task-links", variables.taskId] });
      toast.success("Link added");
    },
    onError: (): void => {
      toast.error("Couldn't add the link");
    },
  });
};

export const useDeleteTaskLink = (): UseMutationResult<void, Error, { id: string; taskId: string }> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; taskId: string }): Promise<void> => {
      await db.delete(taskLinks).where(eq(taskLinks.id, id));
    },
    onSuccess: async (_data, variables): Promise<void> => {
      await queryClient.invalidateQueries({ queryKey: ["task-links", variables.taskId] });
    },
    onError: (): void => {
      toast.error("Couldn't remove the link");
    },
  });
};
