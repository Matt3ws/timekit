import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from "@tanstack/react-query";
import { and, asc, desc, eq, inArray, isNotNull, like, notExists, or, sql, type SQL } from "drizzle-orm";
import { toast } from "sonner";
import type { BatchItem } from "drizzle-orm/batch";
import { db } from "@/db/client";
import { PAGE_SIZE } from "@/components/pagination";
import {
  customers,
  invoiceEntries,
  invoiceLineItems,
  invoices,
  projects,
  subscriptions,
  taskLinks,
  tasks,
  timeEntries,
  type BillingType,
  type Customer,
  type Invoice,
  type InvoiceLineItem,
  type InvoiceKind,
  type InvoiceStatus,
} from "@/db/schema";
import { newId } from "@/lib/ids";
import {
  applyLineEdits,
  computeTotals,
  effectiveCurrency,
  effectiveHourlyRate,
  effectiveTaxRate,
  formatInvoiceNumber,
  lineItemForProject,
  lineItemForTask,
  sellerFromSettings,
  suggestInvoiceCode,
  type EditableLine,
  type ExtraLine,
  type LineEdit,
} from "@/lib/billing";
import { getSettingsRow } from "@/queries/use-settings";
import { getDueSubscriptions } from "@/queries/subscription-due";
import { monthRange, subscriptionInvoiceLines } from "@/lib/subscriptions";
import { invalidateBilling, queryKeys } from "@/queries/keys";

export interface InvoiceWithCustomer extends Invoice {
  customerName: string;
  /** At least one line is a subscription month. */
  hasSubscription: boolean;
}

const invoiceColumns = {
  id: invoices.id,
  invoiceNumber: invoices.invoiceNumber,
  customerId: invoices.customerId,
  status: invoices.status,
  issueDate: invoices.issueDate,
  dueDate: invoices.dueDate,
  currency: invoices.currency,
  subtotal: invoices.subtotal,
  taxRate: invoices.taxRate,
  taxAmount: invoices.taxAmount,
  total: invoices.total,
  notes: invoices.notes,
  pdfPath: invoices.pdfPath,
  paidAt: invoices.paidAt,
  kind: invoices.kind,
  sellerJson: invoices.sellerJson,
  periodStart: invoices.periodStart,
  periodEnd: invoices.periodEnd,
  creditedInvoiceId: invoices.creditedInvoiceId,
  createdAt: invoices.createdAt,
  updatedAt: invoices.updatedAt,
  // Company first, like everywhere else; distinct alias for the positional row mapping.
  customerName: sql<string>`coalesce(customers.company_name, customers.name)`.as("inv_customer_name"),
  hasSubscription: sql`exists (select 1 from invoice_line_items li where li.invoice_id = invoices.id and li.subscription_id is not null)`
    .mapWith(Boolean)
    .as("inv_has_subscription"),
} as const;

export const useInvoices = (): UseQueryResult<InvoiceWithCustomer[], Error> =>
  useQuery({
    queryKey: queryKeys.invoices,
    queryFn: (): Promise<InvoiceWithCustomer[]> =>
      db
        .select(invoiceColumns)
        .from(invoices)
        .innerJoin(customers, eq(invoices.customerId, customers.id))
        .orderBy(desc(invoices.issueDate)),
  });

export interface InvoicesQuery {
  page: number;
  search: string;
  customerId: string | null;
  status: InvoiceStatus | null;
}

export interface PagedInvoices {
  rows: InvoiceWithCustomer[];
  total: number;
}

/** Server-side paginated/filtered/searched invoices for the Invoices list page. */
export const usePaginatedInvoices = (query: InvoicesQuery): UseQueryResult<PagedInvoices, Error> =>
  useQuery({
    queryKey: [...queryKeys.invoices, "page", query],
    queryFn: async (): Promise<PagedInvoices> => {
      const conditions: SQL[] = [];
      if (query.customerId) {
        conditions.push(eq(invoices.customerId, query.customerId));
      }
      if (query.status === "overdue") {
        // Overdue is shown for sent invoices past their due date, so filter the same way.
        conditions.push(sql`(${invoices.status} = 'overdue' or (${invoices.status} = 'sent' and ${invoices.dueDate} < ${Date.now()}))`);
      } else if (query.status === "sent") {
        conditions.push(sql`(${invoices.status} = 'sent' and ${invoices.dueDate} >= ${Date.now()})`);
      } else if (query.status) {
        conditions.push(eq(invoices.status, query.status));
      }
      const term = query.search.trim();
      if (term) {
        const pattern = `%${term}%`;
        const search = or(
          like(invoices.invoiceNumber, pattern),
          like(customers.name, pattern),
          like(customers.companyName, pattern),
        );
        if (search) {
          conditions.push(search);
        }
      }
      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const rows = await db
        .select(invoiceColumns)
        .from(invoices)
        .innerJoin(customers, eq(invoices.customerId, customers.id))
        .where(where)
        .orderBy(desc(invoices.issueDate))
        .limit(PAGE_SIZE)
        .offset((query.page - 1) * PAGE_SIZE);

      const [counted] = await db
        .select({ total: sql<number>`count(*)` })
        .from(invoices)
        .innerJoin(customers, eq(invoices.customerId, customers.id))
        .where(where);
      return { rows, total: Number(counted?.total ?? 0) };
    },
  });

export interface ProjectInvoice {
  id: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  total: number;
  currency: string;
  pdfPath: string | null;
  issueDate: number;
  dueDate: number;
  kind: InvoiceKind;
}

/** Invoices that include a given project (via their line items). */
export const useProjectInvoices = (
  projectId: string | undefined,
): UseQueryResult<ProjectInvoice[], Error> =>
  useQuery({
    queryKey: [...queryKeys.projectInvoices, projectId],
    enabled: Boolean(projectId),
    queryFn: (): Promise<ProjectInvoice[]> =>
      db
        .selectDistinct({
          id: invoices.id,
          invoiceNumber: invoices.invoiceNumber,
          status: invoices.status,
          total: invoices.total,
          currency: invoices.currency,
          pdfPath: invoices.pdfPath,
          issueDate: invoices.issueDate,
          dueDate: invoices.dueDate,
          kind: invoices.kind,
        })
        .from(invoices)
        .innerJoin(invoiceLineItems, eq(invoiceLineItems.invoiceId, invoices.id))
        .where(eq(invoiceLineItems.projectId, projectId ?? ""))
        .orderBy(desc(invoices.issueDate)),
  });

/** One time entry, snapshotted onto an invoice line at generation time. */
export interface InvoiceEntrySnapshot {
  startedAt: number;
  durationSeconds: number;
  description: string | null;
}

export interface LineItemWithProject extends InvoiceLineItem {
  projectTitle: string | null;
  /** Parsed from `entriesJson` — empty when the invoice didn't include time entries. */
  entries: InvoiceEntrySnapshot[];
}

const parseEntries = (json: string | null): InvoiceEntrySnapshot[] => {
  if (!json) {
    return [];
  }
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as InvoiceEntrySnapshot[]) : [];
  } catch {
    return [];
  }
};

/** A task's links, grouped for the invoice's "Documents & links" section. */
export interface InvoiceTaskLinks {
  projectTitle: string | null;
  taskTitle: string;
  links: { title: string; url: string }[];
}

export interface InvoiceDetail {
  invoice: Invoice;
  customer: Customer;
  lineItems: LineItemWithProject[];
  taskLinks: InvoiceTaskLinks[];
  /** Credit notes: the number of the invoice they credit. */
  creditedInvoiceNumber: string | null;
}

/**
 * The links on the given tasks, grouped by task for the invoice's "Documents &
 * links" section. Shared by issued invoices and the builder's live preview.
 */
export const getTaskLinkGroups = async (taskIds: string[]): Promise<InvoiceTaskLinks[]> => {
  if (taskIds.length === 0) {
    return [];
  }
  // Alias to DISTINCT result names: tasks.title, projects.title and task_links.title
  // are all "title", and the sqlite-proxy maps rows positionally via Object.values —
  // duplicate column names collapse and shift the values into the wrong fields.
  const linkRows = await db
    .select({
      taskId: sql<string>`tasks.id`.as("tl_task_id"),
      taskTitle: sql<string>`tasks.title`.as("tl_task_title"),
      projectTitle: sql<string | null>`projects.title`.as("tl_project_title"),
      title: sql<string>`task_links.title`.as("tl_link_title"),
      url: sql<string>`task_links.url`.as("tl_link_url"),
    })
    .from(tasks)
    .innerJoin(taskLinks, eq(taskLinks.taskId, tasks.id))
    .leftJoin(projects, eq(projects.id, tasks.projectId))
    .where(inArray(tasks.id, taskIds))
    .orderBy(asc(taskLinks.position), asc(taskLinks.createdAt));

  const linksByTask = new Map<string, InvoiceTaskLinks>();
  for (const row of linkRows) {
    const group = linksByTask.get(row.taskId) ?? {
      projectTitle: row.projectTitle,
      taskTitle: row.taskTitle,
      links: [],
    };
    group.links.push({ title: row.title, url: row.url });
    linksByTask.set(row.taskId, group);
  }
  return [...linksByTask.values()];
};

/** Load a full invoice (with customer + line items, each tagged with its project title). */
export const getInvoiceDetail = async (id: string): Promise<InvoiceDetail | undefined> => {
  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
  if (!invoice) {
    return undefined;
  }
  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, invoice.customerId))
    .limit(1);
  const rows = await db
    .select()
    .from(invoiceLineItems)
    .where(eq(invoiceLineItems.invoiceId, invoice.id));

  const projectIds = [...new Set(rows.map((r) => r.projectId).filter((p): p is string => p != null))];
  const projectRows = projectIds.length
    ? await db
        .select({ id: projects.id, title: projects.title })
        .from(projects)
        .where(inArray(projects.id, projectIds))
    : [];
  const titleById = new Map(projectRows.map((p) => [p.id, p.title]));

  const lineItems: LineItemWithProject[] = rows.map((row) => ({
    ...row,
    projectTitle: row.projectId ? (titleById.get(row.projectId) ?? null) : null,
    entries: parseEntries(row.entriesJson),
  }));

  if (!customer) {
    return undefined;
  }
  const linkGroups = await getTaskLinkGroups(rows.flatMap((row) => (row.taskId ? [row.taskId] : [])));

  const [credited] = invoice.creditedInvoiceId
    ? await db
        .select({ invoiceNumber: invoices.invoiceNumber })
        .from(invoices)
        .where(eq(invoices.id, invoice.creditedInvoiceId))
        .limit(1)
    : [];

  return {
    invoice,
    customer,
    lineItems,
    taskLinks: linkGroups,
    creditedInvoiceNumber: credited?.invoiceNumber ?? null,
  };
};

export const useInvoiceDetail = (
  id: string | undefined,
): UseQueryResult<InvoiceDetail | undefined, Error> =>
  useQuery({
    queryKey: [...queryKeys.invoices, id],
    enabled: Boolean(id),
    queryFn: async (): Promise<InvoiceDetail | undefined> => (id ? getInvoiceDetail(id) : undefined),
  });

/** What the builder's live preview needs beyond the lines: each task's unbilled entries and its links. */
export interface InvoicePreviewExtras {
  entriesByTask: Record<string, InvoiceEntrySnapshot[]>;
  taskLinks: InvoiceTaskLinks[];
}

interface InvoicePreviewExtrasQuery {
  taskIds: string[];
  /** Only load entries when the invoice will include the breakdown. */
  includeEntries: boolean;
  enabled: boolean;
}

/**
 * The time-entry breakdown and task links for the invoice being built, read
 * the same way `issueInvoice` and `getInvoiceDetail` read them, so the live
 * preview matches the PDF that gets issued.
 */
export const useInvoicePreviewExtras = ({
  taskIds,
  includeEntries,
  enabled,
}: InvoicePreviewExtrasQuery): UseQueryResult<InvoicePreviewExtras, Error> =>
  useQuery({
    queryKey: [...queryKeys.invoiceableWork, "preview-extras", [...taskIds].sort(), includeEntries],
    enabled,
    queryFn: async (): Promise<InvoicePreviewExtras> => {
      const entryRows =
        includeEntries && taskIds.length > 0
          ? await db
              .select({
                taskId: timeEntries.taskId,
                description: timeEntries.description,
                startedAt: timeEntries.startedAt,
                durationSeconds: timeEntries.durationSeconds,
              })
              .from(timeEntries)
              .where(and(inArray(timeEntries.taskId, taskIds), unbilledEntryCondition()))
              .orderBy(asc(timeEntries.startedAt))
          : [];
      const entriesByTask: Record<string, InvoiceEntrySnapshot[]> = {};
      for (const entry of entryRows) {
        (entriesByTask[entry.taskId] ??= []).push({
          startedAt: entry.startedAt,
          durationSeconds: entry.durationSeconds ?? 0,
          description: entry.description,
        });
      }
      return { entriesByTask, taskLinks: await getTaskLinkGroups(taskIds) };
    },
  });

/** A task with unbilled time, used to build the invoice selection UI. */
export interface BillableTask {
  id: string;
  title: string;
  /** The task's own description: becomes the second line of its invoice line. */
  description: string | null;
  /** Stopped time not yet on any invoice. */
  trackedSeconds: number;
  /** A timer is running on this task: that session is billed on a later invoice. */
  running: boolean;
}

export interface BillableProject {
  id: string;
  title: string;
  billingType: BillingType;
  fixedPrice: number | null;
  /** Effective hourly rate (minor units) — for preview of hourly task lines. */
  rate: number;
  currency: string;
  /** Fixed-price only: already on an invoice that hasn't been credited. */
  alreadyBilled: boolean;
  /** Hourly only: tasks with unbilled (or running) time. */
  tasks: BillableTask[];
}

/** Unbilled, stopped entries: what a new invoice may claim. */
const unbilledEntryCondition = (): SQL | undefined =>
  and(
    isNotNull(timeEntries.endedAt),
    notExists(
      db.select({ one: sql`1` }).from(invoiceEntries).where(eq(invoiceEntries.timeEntryId, timeEntries.id)),
    ),
  );

/** Fixed-price projects that are on an invoice which hasn't been credited. */
const billedFixedProjectIds = async (projectIds: string[]): Promise<Set<string>> => {
  if (projectIds.length === 0) {
    return new Set();
  }
  const rows = await db
    .selectDistinct({ projectId: invoiceLineItems.projectId })
    .from(invoiceLineItems)
    .innerJoin(invoices, eq(invoices.id, invoiceLineItems.invoiceId))
    .where(
      and(
        inArray(invoiceLineItems.projectId, projectIds),
        eq(invoices.kind, "invoice"),
        sql`${invoices.status} <> 'credited'`,
      ),
    );
  return new Set(rows.map((row) => row.projectId).filter((id): id is string => id !== null));
};

/** A customer's billable work: hourly projects with their unbilled tasks, plus fixed projects. */
export const useInvoiceableWork = (
  customerId: string | undefined,
): UseQueryResult<BillableProject[], Error> =>
  useQuery({
    queryKey: [...queryKeys.invoiceableWork, customerId],
    enabled: Boolean(customerId),
    queryFn: async (): Promise<BillableProject[]> => {
      const settingsRow = await getSettingsRow();
      const projectRows = await db
        .select()
        .from(projects)
        .where(eq(projects.customerId, customerId ?? ""))
        .orderBy(asc(projects.title));
      const projectIds = projectRows.map((project) => project.id);
      if (projectIds.length === 0) {
        return [];
      }

      // One query for every task of the customer (no per-project round trips).
      const taskRows = await db
        .select({
          id: tasks.id,
          projectId: tasks.projectId,
          title: tasks.title,
          description: tasks.description,
          trackedSeconds: sql<number>`coalesce((
            select sum(te.duration_seconds) from time_entries te
            where te.task_id = tasks.id and te.ended_at is not null
              and not exists (select 1 from invoice_entries ie where ie.time_entry_id = te.id)
          ), 0)`.as("unbilled_seconds"),
          running: sql<number>`exists (
            select 1 from time_entries te where te.task_id = tasks.id and te.ended_at is null
          )`.as("is_running"),
        })
        .from(tasks)
        .where(inArray(tasks.projectId, projectIds))
        .orderBy(asc(tasks.position), asc(tasks.createdAt));
      const billedFixed = await billedFixedProjectIds(
        projectRows.filter((project) => project.billingType === "fixed").map((project) => project.id),
      );

      return projectRows.map((project): BillableProject => ({
        id: project.id,
        title: project.title,
        billingType: project.billingType,
        fixedPrice: project.billingType === "fixed" ? project.fixedPrice : null,
        rate: effectiveHourlyRate(project, settingsRow),
        currency: effectiveCurrency(project, settingsRow),
        alreadyBilled: billedFixed.has(project.id),
        tasks:
          project.billingType === "fixed"
            ? []
            : taskRows
                .filter((task) => task.projectId === project.id && (task.trackedSeconds > 0 || Boolean(task.running)))
                .map((task) => ({
                  id: task.id,
                  title: task.title,
                  description: task.description,
                  trackedSeconds: Number(task.trackedSeconds),
                  running: Boolean(task.running),
                })),
      }));
    },
  });

export interface CreateInvoiceInput {
  customerId: string;
  /** Hourly task ids to bill: every unbilled, stopped entry on them (one line per task). */
  taskIds: string[];
  /** Fixed-price project ids to bill (one line each). */
  fixedProjectIds: string[];
  /** List each task's individual time entries (with descriptions) under its line. */
  includeTimeEntries?: boolean;
  /** Review-step changes to generated lines, keyed "task:<id>" / "fixed:<projectId>". */
  edits?: Record<string, LineEdit>;
  /** Hand-added lines (e.g. a monthly hosting fee), unit price incl. moms. */
  extras?: ExtraLine[];
  /** Payment terms in days (default: the customer's payment terms). */
  dueDays?: number;
  notes?: string | null;
  /** Service period printed on the invoice; derived from the billed entries when omitted. */
  period?: { start: number; end: number };
  /** Subscriptions whose due months go on this invoice (one line per month). */
  subscriptionIds?: string[];
  /** Further writes that must commit together with the invoice. */
  alsoWrite?: BatchItem<"sqlite">[];
}

/**
 * Issue an invoice from selected tasks (hourly) and fixed-price projects of one
 * customer. It claims the tasks' unbilled stopped entries (a running timer is
 * left for a later invoice), takes the next sequential number, and writes
 * everything in one transaction. Usable outside React (subscriptions issue
 * invoices on app start); `useCreateInvoice` wraps it for the UI.
 */
export const issueInvoice = async ({
  customerId,
  taskIds,
  fixedProjectIds,
  includeTimeEntries,
  edits = {},
  extras = [],
  dueDays,
  notes = null,
  period,
  subscriptionIds = [],
  alsoWrite = [],
}: CreateInvoiceInput): Promise<Invoice> => {
  if (taskIds.length === 0 && fixedProjectIds.length === 0 && extras.length === 0 && subscriptionIds.length === 0) {
    throw new Error("Pick at least one task or project, or add a line");
  }
  const settingsRow = await getSettingsRow();
  const [customer] = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
  if (!customer) {
    throw new Error("Customer not found");
  }

  // The entries this invoice claims.
  const entryRows =
    taskIds.length > 0
      ? await db
          .select({
            id: timeEntries.id,
            taskId: timeEntries.taskId,
            description: timeEntries.description,
            startedAt: timeEntries.startedAt,
            durationSeconds: timeEntries.durationSeconds,
          })
          .from(timeEntries)
          .where(and(inArray(timeEntries.taskId, taskIds), unbilledEntryCondition()))
          .orderBy(asc(timeEntries.startedAt))
      : [];
  const entriesByTask = new Map<string, typeof entryRows>();
  for (const entry of entryRows) {
    entriesByTask.set(entry.taskId, [...(entriesByTask.get(entry.taskId) ?? []), entry]);
  }

  const taskRows =
    taskIds.length > 0
      ? await db
          .select({ id: tasks.id, title: tasks.title, description: tasks.description, projectId: tasks.projectId })
          .from(tasks)
          .where(inArray(tasks.id, taskIds))
      : [];
  const billableTasks = taskRows.filter((task) => entriesByTask.has(task.id));

  // Fixed-price projects can be billed once (until that invoice is credited).
  const alreadyBilled = await billedFixedProjectIds(fixedProjectIds);
  if (alreadyBilled.size > 0) {
    throw new Error("A selected fixed-price project is already invoiced");
  }

  const projectIds = [...new Set([...billableTasks.map((task) => task.projectId), ...fixedProjectIds])];
  const projectRows =
    projectIds.length > 0 ? await db.select().from(projects).where(inArray(projects.id, projectIds)) : [];
  const projectById = new Map(projectRows.map((project) => [project.id, project]));

  // Enforce a single currency across the whole invoice.
  const currencies = new Set(projectRows.map((project) => effectiveCurrency(project, settingsRow)));
  if (currencies.size > 1) {
    throw new Error("Selected work uses different currencies");
  }
  const currency = [...currencies][0] ?? settingsRow.currency;

  // One line per task (its claimed entries summed, rounded up to 15 min), plus fixed projects.
  const generated: { item: EditableLine; entriesJson: string | null }[] = [
    ...billableTasks.flatMap((task) => {
      const project = projectById.get(task.projectId);
      const entries = entriesByTask.get(task.id) ?? [];
      if (!project) {
        return [];
      }
      const trackedSeconds = entries.reduce((sum, entry) => sum + (entry.durationSeconds ?? 0), 0);
      const snapshot: InvoiceEntrySnapshot[] = entries.map((entry) => ({
        startedAt: entry.startedAt,
        durationSeconds: entry.durationSeconds ?? 0,
        description: entry.description,
      }));
      return [
        {
          item: {
            key: `task:${task.id}`,
            ...lineItemForTask({ project, settings: settingsRow, task: { ...task, trackedSeconds } }),
          },
          entriesJson: includeTimeEntries && snapshot.length > 0 ? JSON.stringify(snapshot) : null,
        },
      ];
    }),
    ...fixedProjectIds.flatMap((projectId) => {
      const project = projectById.get(projectId);
      return project
        ? [
            {
              item: {
                key: `fixed:${project.id}`,
                ...lineItemForProject({ project, settings: settingsRow, trackedSeconds: 0 }),
              },
              entriesJson: null,
            },
          ]
        : [];
    }),
  ];
  // Subscriptions: every due month, read fresh from the database (the same
  // lines the preview built), and the months marked billed in the same
  // transaction below, so a month is never billed twice or lost.
  const dueSubscriptions = subscriptionIds.length
    ? (await getDueSubscriptions()).filter(
        (due) => subscriptionIds.includes(due.id) && due.customerId === customerId,
      )
    : [];
  for (const due of dueSubscriptions) {
    for (const line of subscriptionInvoiceLines({ ...due, language: due.invoiceLanguage })) {
      generated.push({ item: line, entriesJson: null });
    }
  }
  const subscriptionMonths = dueSubscriptions.flatMap((due) => due.months).sort();
  const markBilled = dueSubscriptions.map((due) =>
    db
      .update(subscriptions)
      .set({ billedThrough: due.months[due.months.length - 1], updatedAt: Date.now() })
      .where(eq(subscriptions.id, due.id)),
  );

  // The review step's edits and hand-added lines, applied exactly as the preview did.
  const entriesJsonByKey = new Map(generated.map((line) => [line.item.key, line.entriesJson]));
  const lines = applyLineEdits(
    generated.map((line) => line.item),
    edits,
    extras,
  ).map((item) => ({ item, entriesJson: entriesJsonByKey.get(item.key) ?? null }));
  if (lines.length === 0) {
    throw new Error("Nothing to invoice: the selected tasks have no unbilled time");
  }
  const taxRate = effectiveTaxRate(settingsRow);
  const totals = computeTotals(
    lines.map((line) => line.item),
    taxRate,
  );

  // The customer's own series: its code (suggested on the first invoice) and next number.
  const takenCodes = await db
    .select({ code: customers.invoiceCode })
    .from(customers)
    .where(isNotNull(customers.invoiceCode));
  const invoiceCode =
    customer.invoiceCode ??
    suggestInvoiceCode(
      customer.companyName ?? customer.name,
      takenCodes.map((row) => row.code ?? ""),
    );
  const sequence = customer.invoiceNumberNext;

  const now = Date.now();
  // Service period: the billed entries and subscription months together.
  const startedAts = [
    ...entryRows.map((entry) => entry.startedAt),
    ...subscriptionMonths.flatMap((month) => [monthRange(month).start, monthRange(month).end]),
  ];
  const invoice: Invoice = {
    id: newId(),
    invoiceNumber: formatInvoiceNumber(settingsRow.invoiceNumberPrefix, invoiceCode, sequence),
    customerId,
    status: "sent",
    issueDate: now,
    dueDate: now + (dueDays ?? customer.paymentTermsDays) * 24 * 60 * 60 * 1000,
    currency,
    subtotal: totals.subtotal,
    taxRate,
    taxAmount: totals.taxAmount,
    total: totals.total,
    notes: notes?.trim() || null,
    pdfPath: null,
    paidAt: null,
    kind: "invoice",
    // Frozen at issue: a regenerated PDF never picks up later changes to Settings.
    sellerJson: JSON.stringify(sellerFromSettings(settingsRow)),
    periodStart: period?.start ?? (startedAts.length > 0 ? Math.min(...startedAts) : null),
    periodEnd: period?.end ?? (startedAts.length > 0 ? Math.max(...startedAts) : null),
    creditedInvoiceId: null,
    createdAt: now,
    updatedAt: now,
  };

  // All or nothing: the invoice, its lines, the claimed entries and the
  // next number. UNIQUE(time_entry_id) and UNIQUE(invoice_number) make a
  // concurrent double-issue fail instead of double billing.
  await db.batch([
    db.insert(invoices).values(invoice),
    ...lines.map(({ item, entriesJson }) =>
      db.insert(invoiceLineItems).values({
        id: newId(),
        invoiceId: invoice.id,
        projectId: item.projectId || null,
        taskId: item.taskId ?? null,
        subscriptionId: item.subscriptionId ?? null,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        amount: item.amount,
        entriesJson,
      }),
    ),
    ...entryRows.map((entry) =>
      db.insert(invoiceEntries).values({ id: newId(), invoiceId: invoice.id, timeEntryId: entry.id }),
    ),
    db
      .update(customers)
      .set({ invoiceCode, invoiceNumberNext: sequence + 1, updatedAt: now })
      .where(eq(customers.id, customer.id)),
    ...markBilled,
    ...alsoWrite,
  ]);

  return invoice;
};

/** `issueInvoice` as a mutation, with cache refresh and toasts. */
export const useCreateInvoice = (): UseMutationResult<Invoice, Error, CreateInvoiceInput> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: issueInvoice,
    onSuccess: async (): Promise<void> => {
      await Promise.all([
        invalidateBilling(queryClient),
        queryClient.invalidateQueries({ queryKey: queryKeys.customers }),
        // Subscription months on the invoice are now billed.
        queryClient.invalidateQueries({ queryKey: ["subscriptions"], refetchType: "all" }),
      ]);
      toast.success("Invoice issued");
    },
    onError: (error: Error): void => {
      toast.error(error.message || "Couldn't create invoice");
    },
  });
};

export interface CreditInvoiceInput {
  id: string;
}

/**
 * Cancel an issued invoice the Danish way: issue a credit note (kreditnota)
 * with the next number in the customer's series and the same lines negated,
 * mark the original "credited", and release its time entries so they can be
 * invoiced again. One transaction.
 */
export const useCreditInvoice = (): UseMutationResult<Invoice, Error, CreditInvoiceInput> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: CreditInvoiceInput): Promise<Invoice> => {
      const [original] = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
      if (!original) {
        throw new Error("Invoice not found");
      }
      if (original.kind !== "invoice" || original.status === "credited") {
        throw new Error("This invoice can't be credited");
      }
      const [customer] = await db.select().from(customers).where(eq(customers.id, original.customerId)).limit(1);
      if (!customer) {
        throw new Error("Customer not found");
      }
      const settingsRow = await getSettingsRow();
      const originalLines = await db.select().from(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, id));

      const takenCodes = await db
        .select({ code: customers.invoiceCode })
        .from(customers)
        .where(isNotNull(customers.invoiceCode));
      const invoiceCode =
        customer.invoiceCode ??
        suggestInvoiceCode(customer.companyName ?? customer.name, takenCodes.map((row) => row.code ?? ""));
      const sequence = customer.invoiceNumberNext;
      const now = Date.now();
      const creditNote: Invoice = {
        ...original,
        id: newId(),
        invoiceNumber: formatInvoiceNumber(settingsRow.invoiceNumberPrefix, invoiceCode, sequence),
        kind: "credit_note",
        status: "sent",
        issueDate: now,
        dueDate: now,
        subtotal: -original.subtotal,
        taxAmount: -original.taxAmount,
        total: -original.total,
        notes: null,
        pdfPath: null,
        paidAt: null,
        sellerJson: JSON.stringify(sellerFromSettings(settingsRow)),
        creditedInvoiceId: original.id,
        createdAt: now,
        updatedAt: now,
      };

      await db.batch([
        db.insert(invoices).values(creditNote),
        ...originalLines.map((line) =>
          db.insert(invoiceLineItems).values({
            ...line,
            id: newId(),
            invoiceId: creditNote.id,
            quantity: -line.quantity,
            amount: -line.amount,
          }),
        ),
        db.update(invoices).set({ status: "credited", updatedAt: now }).where(eq(invoices.id, original.id)),
        // Releases the billed time: it shows up as unbilled again.
        db.delete(invoiceEntries).where(eq(invoiceEntries.invoiceId, original.id)),
        db
          .update(customers)
          .set({ invoiceCode, invoiceNumberNext: sequence + 1, updatedAt: now })
          .where(eq(customers.id, customer.id)),
      ]);
      return creditNote;
    },
    onSuccess: async (creditNote): Promise<void> => {
      await Promise.all([
        invalidateBilling(queryClient),
        queryClient.invalidateQueries({ queryKey: queryKeys.customers }),
      ]);
      toast.success(`Credit note ${creditNote.invoiceNumber} issued. The time is unbilled again.`);
    },
    onError: (error: Error): void => {
      toast.error(error.message || "Couldn't credit the invoice");
    },
  });
};

export interface UpdateInvoiceStatusInput {
  id: string;
  status: InvoiceStatus;
}

export const useUpdateInvoiceStatus = (): UseMutationResult<void, Error, UpdateInvoiceStatusInput> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: UpdateInvoiceStatusInput): Promise<void> => {
      await db
        .update(invoices)
        .set({ status, paidAt: status === "paid" ? Date.now() : null, updatedAt: Date.now() })
        .where(eq(invoices.id, id));
    },
    onSuccess: async (): Promise<void> => {
      await invalidateBilling(queryClient);
      toast.success("Invoice updated");
    },
    onError: (): void => {
      toast.error("Couldn't update invoice");
    },
  });
};

export const useSetInvoicePdfPath = (): UseMutationResult<void, Error, { id: string; pdfPath: string }> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, pdfPath }: { id: string; pdfPath: string }): Promise<void> => {
      await db.update(invoices).set({ pdfPath, updatedAt: Date.now() }).where(eq(invoices.id, id));
    },
    onSuccess: async (): Promise<void> => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.invoices }),
        queryClient.invalidateQueries({ queryKey: queryKeys.projectInvoices }),
      ]);
    },
  });
};
