import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { customers, projects, tasks } from "@/db/schema";
import { billableHours } from "@/lib/billing";
import { getSettingsRow } from "@/queries/use-settings";
import { queryKeys } from "@/queries/keys";

/** Money waiting to be invoiced for one customer. */
export interface UnbilledCustomer {
  customerId: string;
  customerName: string;
  currency: string;
  /** Minor units: unbilled hourly time (rounded per task) plus unbilled fixed prices. */
  amount: number;
  /** Unbilled hourly time, seconds. */
  seconds: number;
}

/** A task worked on recently, for one-click restarts. */
export interface RecentTask {
  taskId: string;
  taskTitle: string;
  projectId: string;
  projectTitle: string;
  customerId: string;
  trackedSeconds: number;
  lastWorkedAt: number;
}

/**
 * Unbilled work grouped by customer, largest first. Hourly tasks are rounded up
 * to 15 minutes each (as the invoice will bill them); fixed-price projects count
 * until they are on an invoice that hasn't been credited.
 */
export const useUnbilledByCustomer = (): UseQueryResult<UnbilledCustomer[], Error> =>
  useQuery({
    queryKey: [...queryKeys.invoiceableWork, "by-customer"],
    queryFn: async (): Promise<UnbilledCustomer[]> => {
      const settings = await getSettingsRow();
      // Distinct result names: the sqlite-proxy maps rows by position (see lessons.md).
      const rows = await db
        .select({
          customerId: sql<string>`customers.id`.as("ub_customer_id"),
          customerName: sql<string>`coalesce(customers.company_name, customers.name)`.as("ub_customer_name"),
          billingType: sql<string>`projects.billing_type`.as("ub_billing_type"),
          rate: sql<number | null>`projects.hourly_rate`.as("ub_rate"),
          fixedPrice: sql<number | null>`projects.fixed_price`.as("ub_fixed_price"),
          currency: sql<string | null>`projects.currency`.as("ub_currency"),
          fixedBilled: sql<number>`exists (
            select 1 from invoice_line_items li join invoices inv on inv.id = li.invoice_id
            where li.project_id = projects.id and inv.kind = 'invoice' and inv.status <> 'credited'
          )`.as("ub_fixed_billed"),
          taskSeconds: sql<string | null>`(
            select group_concat(per_task.seconds) from (
              select sum(te.duration_seconds) as seconds
              from time_entries te join tasks tk on tk.id = te.task_id
              where tk.project_id = projects.id and te.ended_at is not null
                and not exists (select 1 from invoice_entries ie where ie.time_entry_id = te.id)
              group by te.task_id
            ) per_task
          )`.as("ub_task_seconds"),
        })
        .from(projects)
        .innerJoin(customers, sql`customers.id = projects.customer_id`);

      const byCustomer = new Map<string, UnbilledCustomer>();
      for (const row of rows) {
        const currency = row.currency ?? settings.currency;
        const rate = row.rate ?? settings.defaultHourlyRate;
        const perTask = (row.taskSeconds ?? "").split(",").filter(Boolean).map(Number);
        const hourly = row.billingType === "hourly";
        const amount = hourly
          ? perTask.reduce((sum, seconds) => sum + Math.round(billableHours(seconds) * rate), 0)
          : row.fixedBilled
            ? 0
            : (row.fixedPrice ?? 0);
        if (amount === 0) {
          continue;
        }
        const key = `${row.customerId}:${currency}`;
        const entry = byCustomer.get(key) ?? {
          customerId: row.customerId,
          customerName: row.customerName,
          currency,
          amount: 0,
          seconds: 0,
        };
        entry.amount += amount;
        entry.seconds += hourly ? perTask.reduce((sum, seconds) => sum + seconds, 0) : 0;
        byCustomer.set(key, entry);
      }
      return [...byCustomer.values()].sort((a, b) => b.amount - a.amount);
    },
  });

/** The most recently worked-on open tasks (not done), newest first. */
export const useRecentTasks = (limit: number): UseQueryResult<RecentTask[], Error> =>
  useQuery({
    queryKey: [...queryKeys.tasks, "recent", limit],
    queryFn: (): Promise<RecentTask[]> =>
      db
        .select({
          taskId: sql<string>`tasks.id`.as("rt_task_id"),
          taskTitle: sql<string>`tasks.title`.as("rt_task_title"),
          projectId: sql<string>`projects.id`.as("rt_project_id"),
          projectTitle: sql<string>`projects.title`.as("rt_project_title"),
          customerId: sql<string>`projects.customer_id`.as("rt_customer_id"),
          trackedSeconds: sql<number>`coalesce((
            select sum(te.duration_seconds) from time_entries te where te.task_id = tasks.id
          ), 0)`.as("rt_tracked"),
          lastWorkedAt: sql<number>`(
            select max(te.started_at) from time_entries te where te.task_id = tasks.id
          )`.as("rt_last_worked"),
        })
        .from(tasks)
        .innerJoin(projects, sql`projects.id = tasks.project_id`)
        .where(sql`tasks.status <> 'done' and exists (select 1 from time_entries te where te.task_id = tasks.id)`)
        .orderBy(sql`rt_last_worked desc`)
        .limit(limit),
  });
