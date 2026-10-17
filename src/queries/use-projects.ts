import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from "@tanstack/react-query";
import { and, desc, eq, like, sql, type SQL } from "drizzle-orm";
import { toast } from "sonner";
import { db } from "@/db/client";
import { customers, projects, type Project, type NewProject, type ProjectStatus } from "@/db/schema";
import { newId } from "@/lib/ids";
import { PAGE_SIZE } from "@/components/pagination";
import { invalidateNames, invalidateTimeData, queryKeys } from "@/queries/keys";
import { isBilledTimeError } from "@/queries/use-tasks";

export interface ProjectWithMeta extends Project {
  customerName: string;
  customerCompany: string | null;
  trackedSeconds: number;
  /**
   * Unbilled time in billable quarter hours: each task's unbilled seconds
   * rounded up to 15 min on its own, the way invoice lines are built.
   */
  unbilledQuarterHours: number;
  /** Minor units already invoiced for this project (invoices that haven't been credited). */
  billedMinor: number;
}

/** Column set shared by the full and paginated project queries. */
const projectColumns = {
  id: projects.id,
  customerId: projects.customerId,
  title: projects.title,
  description: projects.description,
  status: projects.status,
  startDate: projects.startDate,
  endDate: projects.endDate,
  billingType: projects.billingType,
  hourlyRate: projects.hourlyRate,
  fixedPrice: projects.fixedPrice,
  estimatedMinutes: projects.estimatedMinutes,
  currency: projects.currency,
  // Derived: the most recent invoice that includes this project (null = not billed).
  billedAt: sql<number | null>`(
    select max(inv.created_at)
    from invoices inv
    join invoice_line_items li on li.invoice_id = inv.id
    where li.project_id = projects.id
  )`,
  createdAt: projects.createdAt,
  updatedAt: projects.updatedAt,
  customerName: customers.name,
  customerCompany: customers.companyName,
  // Hand-qualified to avoid Drizzle's unqualified-column rendering in raw sql``.
  trackedSeconds: sql<number>`coalesce((
    select sum(te.duration_seconds)
    from time_entries te
    join tasks tk on tk.id = te.task_id
    where tk.project_id = projects.id
  ), 0)`,
  unbilledQuarterHours: sql<number>`coalesce((
    select sum((per_task.seconds + 899) / 900)
    from (
      select sum(te.duration_seconds) as seconds
      from time_entries te
      join tasks tk on tk.id = te.task_id
      where tk.project_id = projects.id
        and te.ended_at is not null
        and not exists (select 1 from invoice_entries ie where ie.time_entry_id = te.id)
      group by te.task_id
    ) per_task
  ), 0)`.as("unbilled_quarter_hours"),
  billedMinor: sql<number>`coalesce((
    select sum(li.amount)
    from invoice_line_items li
    join invoices inv on inv.id = li.invoice_id
    where li.project_id = projects.id
      and inv.kind = 'invoice'
      and inv.status <> 'credited'
  ), 0)`.as("billed_minor"),
} as const;

/** All projects with their customer name and total tracked seconds (used by the dashboard). */
export const useProjects = (): UseQueryResult<ProjectWithMeta[], Error> =>
  useQuery({
    queryKey: queryKeys.projects,
    queryFn: (): Promise<ProjectWithMeta[]> =>
      db
        .select(projectColumns)
        .from(projects)
        .innerJoin(customers, eq(projects.customerId, customers.id))
        .orderBy(desc(projects.updatedAt)),
  });

export interface ProjectsQuery {
  page: number;
  search: string;
  customerId: string | null;
  status: ProjectStatus | null;
}

export interface PagedProjects {
  rows: ProjectWithMeta[];
  total: number;
}

/** Server-side paginated/filtered/searched projects for the Projects list page. */
export const usePaginatedProjects = (query: ProjectsQuery): UseQueryResult<PagedProjects, Error> =>
  useQuery({
    queryKey: [...queryKeys.projects, "page", query],
    queryFn: async (): Promise<PagedProjects> => {
      const conditions: SQL[] = [];
      if (query.customerId) {
        conditions.push(eq(projects.customerId, query.customerId));
      }
      if (query.status) {
        conditions.push(eq(projects.status, query.status));
      }
      const term = query.search.trim();
      if (term) {
        conditions.push(like(projects.title, `%${term}%`));
      }
      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const rows = await db
        .select(projectColumns)
        .from(projects)
        .innerJoin(customers, eq(projects.customerId, customers.id))
        .where(where)
        .orderBy(desc(projects.updatedAt))
        .limit(PAGE_SIZE)
        .offset((query.page - 1) * PAGE_SIZE);

      const [counted] = await db
        .select({ total: sql<number>`count(*)` })
        .from(projects)
        .where(where);
      return { rows, total: Number(counted?.total ?? 0) };
    },
  });

export const useProject = (id: string | undefined): UseQueryResult<Project | null, Error> =>
  useQuery({
    queryKey: [...queryKeys.projects, id],
    enabled: Boolean(id),
    // null (not undefined) for a missing project: the page shows "not found"
    // instead of a skeleton forever.
    queryFn: async (): Promise<Project | null> => {
      const rows = await db.select().from(projects).where(eq(projects.id, id ?? "")).limit(1);
      return rows[0] ?? null;
    },
  });

export const useCreateProject = (): UseMutationResult<Project, Error, NewProject> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (values: NewProject): Promise<Project> => {
      const [created] = await db
        .insert(projects)
        .values({ ...values, id: values.id ?? newId() })
        .returning();
      return created;
    },
    onSuccess: async (): Promise<void> => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.projects });
      toast.success("Project created");
    },
    onError: (): void => {
      toast.error("Couldn't create project");
    },
  });
};

export interface UpdateProjectInput extends Partial<NewProject> {
  id: string;
}

export const useUpdateProject = (): UseMutationResult<void, Error, UpdateProjectInput> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: UpdateProjectInput): Promise<void> => {
      await db
        .update(projects)
        .set({ ...patch, updatedAt: Date.now() })
        .where(eq(projects.id, id));
    },
    onSuccess: async (): Promise<void> => {
      // Rate, currency and title feed the timer, the invoice builder and totals.
      await Promise.all([invalidateNames(queryClient), invalidateTimeData(queryClient)]);
      toast.success("Project saved");
    },
    onError: (): void => {
      toast.error("Couldn't save project");
    },
  });
};

export const useDeleteProject = (): UseMutationResult<void, Error, { id: string }> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string }): Promise<void> => {
      await db.delete(projects).where(eq(projects.id, id));
    },
    onSuccess: async (): Promise<void> => {
      await Promise.all([invalidateNames(queryClient), invalidateTimeData(queryClient)]);
      toast.success("Project deleted");
    },
    onError: (error: Error): void => {
      toast.error(
        isBilledTimeError(error)
          ? "This project has invoiced time, so it can't be deleted. Archive it instead."
          : "Couldn't delete project",
      );
    },
  });
};
