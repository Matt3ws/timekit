import type { QueryClient } from "@tanstack/react-query";

/**
 * Query key prefixes. Every query key starts with one of these, so a prefix
 * invalidates every variant (per project, per page, per id) at once.
 */
export const queryKeys = {
  activeTimer: ["active-timer"],
  customers: ["customers"],
  projects: ["projects"],
  tasks: ["tasks"],
  timeEntries: ["time-entries"],
  taskLinks: ["task-links"],
  invoices: ["invoices"],
  projectInvoices: ["project-invoices"],
  invoiceableWork: ["invoiceable-work"],
  stats: ["stats"],
  settings: ["settings"],
} as const satisfies Record<string, readonly string[]>;

type KeyName = keyof typeof queryKeys;

const invalidate = async (queryClient: QueryClient, names: KeyName[]): Promise<void> => {
  // refetchType "all" also refetches inactive observers (e.g. a closed dialog
  // that stays mounted), so nothing shows a stale total when it reappears.
  await Promise.all(
    names.map((name) => queryClient.invalidateQueries({ queryKey: queryKeys[name], refetchType: "all" })),
  );
};

/**
 * After anything that changes tracked time: starting/stopping timers, adding,
 * editing or deleting entries, creating/deleting tasks. Totals appear on the
 * dashboard, project pages, task rows and in the invoice builder.
 */
export const invalidateTimeData = (queryClient: QueryClient): Promise<void> =>
  invalidate(queryClient, ["activeTimer", "tasks", "timeEntries", "projects", "stats", "invoiceableWork"]);

/**
 * After anything that changes what is billed: issuing, crediting or deleting
 * invoices, changing their status. Billed flags live on entries, tasks and
 * projects too.
 */
export const invalidateBilling = (queryClient: QueryClient): Promise<void> =>
  invalidate(queryClient, [
    "invoices",
    "projectInvoices",
    "invoiceableWork",
    "projects",
    "tasks",
    "timeEntries",
    "stats",
  ]);

/** After renaming or deleting something whose name is shown elsewhere (customer, project, task). */
export const invalidateNames = (queryClient: QueryClient): Promise<void> =>
  invalidate(queryClient, ["customers", "projects", "tasks", "activeTimer", "invoices", "projectInvoices", "invoiceableWork"]);
