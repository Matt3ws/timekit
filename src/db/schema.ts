import { sqliteTable, text, integer, real, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";
import { newId } from "@/lib/ids";

/* ---------------------------------------------------------------- enums */

export const PROJECT_STATUS = ["draft", "active", "on_hold", "completed", "archived"] as const;
export const BILLING_TYPE = ["hourly", "fixed"] as const;
export const TASK_STATUS = ["backlog", "todo", "in_progress", "done"] as const;
export const INVOICE_STATUS = ["draft", "sent", "paid", "overdue", "cancelled", "credited"] as const;
/** An ordinary invoice, or a credit note (kreditnota) cancelling one. */
export const INVOICE_KIND = ["invoice", "credit_note"] as const;
/** Expense categories, in the order the picker shows them. */
export const EXPENSE_CATEGORY = [
  "software",
  "hosting",
  "hardware",
  "office",
  "phone_internet",
  "travel",
  "education",
  "marketing",
  "other",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORY)[number];

/** Display labels for expense categories. */
export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  software: "Software & subscriptions",
  hosting: "Hosting & domains",
  hardware: "Hardware & equipment",
  office: "Office & supplies",
  phone_internet: "Phone & internet",
  travel: "Travel & transport",
  education: "Courses & books",
  marketing: "Marketing",
  other: "Other",
};

/** How a subscription's monthly invoice is issued. */
export const SUBSCRIPTION_MODE = ["auto", "review"] as const;
export type SubscriptionMode = (typeof SUBSCRIPTION_MODE)[number];

/** Language a customer's invoices are written in. */
export const INVOICE_LANGUAGE = ["da", "en"] as const;

export type ProjectStatus = (typeof PROJECT_STATUS)[number];
export type BillingType = (typeof BILLING_TYPE)[number];
export type TaskStatus = (typeof TASK_STATUS)[number];
export type InvoiceStatus = (typeof INVOICE_STATUS)[number];
export type InvoiceKind = (typeof INVOICE_KIND)[number];
export type InvoiceLanguage = (typeof INVOICE_LANGUAGE)[number];

/** Display labels for task statuses, in workflow order. */
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: "Backlog",
  todo: "Todo",
  in_progress: "In progress",
  done: "Done",
};

/* ------------------------------------------------------------- helpers */

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => newId());

const createdAt = () =>
  integer("created_at")
    .notNull()
    .$defaultFn(() => Date.now());

const updatedAt = () =>
  integer("updated_at")
    .notNull()
    .$defaultFn(() => Date.now());

/* ----------------------------------------------------------- customers */

export const customers = sqliteTable("customers", {
  id: id(),
  name: text("name").notNull(),
  companyName: text("company_name"),
  email: text("email"),
  phone: text("phone"),
  addressLine1: text("address_line1"),
  addressLine2: text("address_line2"),
  postalCode: text("postal_code"),
  city: text("city"),
  country: text("country"),
  vatNumber: text("vat_number"),
  notes: text("notes"),
  /**
   * The customer's invoice series code, e.g. "FIN" → "Cc-FIN-00001". Unique
   * (case-insensitive). null until the first invoice, which suggests one.
   */
  invoiceCode: text("invoice_code"),
  /** The next number in this customer's own invoice series. */
  invoiceNumberNext: integer("invoice_number_next").notNull().default(1),
  invoiceLanguage: text("invoice_language", { enum: INVOICE_LANGUAGE }).notNull().default("da"),
  /** Days until an invoice is due ("Netto N dage"); the invoice builder starts from this. */
  paymentTermsDays: integer("payment_terms_days").notNull().default(14),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/* ------------------------------------------------------------ projects */

export const projects = sqliteTable("projects", {
  id: id(),
  customerId: text("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "restrict" }),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status", { enum: PROJECT_STATUS }).notNull().default("draft"),
  startDate: integer("start_date"),
  endDate: integer("end_date"),
  billingType: text("billing_type", { enum: BILLING_TYPE }).notNull().default("hourly"),
  /** Override of settings.defaultHourlyRate, in minor units. null => use the default. */
  hourlyRate: integer("hourly_rate"),
  /** Flat amount in minor units, used when billingType === "fixed". */
  fixedPrice: integer("fixed_price"),
  estimatedMinutes: integer("estimated_minutes"),
  /** Override of settings.currency (ISO 4217). null => use the default. */
  currency: text("currency"),
  /** Unused: billed state is derived from invoices. Kept for existing databases. */
  billedAt: integer("billed_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [index("projects_customer_idx").on(table.customerId)]);

/* --------------------------------------------------------------- tasks */

export const tasks = sqliteTable("tasks", {
  id: id(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status", { enum: TASK_STATUS }).notNull().default("todo"),
  position: integer("position").notNull().default(0),
  completedAt: integer("completed_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [index("tasks_project_idx").on(table.projectId)]);

/* -------------------------------------------------------- time_entries */

export const timeEntries = sqliteTable("time_entries", {
  id: id(),
  taskId: text("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  description: text("description"),
  startedAt: integer("started_at").notNull(),
  /** null while the timer is running. */
  endedAt: integer("ended_at"),
  /** Recomputed from start/end on every edit; settable directly for manual entries. */
  durationSeconds: integer("duration_seconds"),
  /** Points at the root of a resume-chain (the original entry). */
  resumedFromId: text("resumed_from_id"),
  isManual: integer("is_manual", { mode: "boolean" }).notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  index("time_entries_task_idx").on(table.taskId),
  /** At most one running timer. */
  uniqueIndex("time_entries_one_running")
    .on(sql`(${table.endedAt} IS NULL)`)
    .where(sql`${table.endedAt} IS NULL`),
]);

/* ------------------------------------------------------------ invoices */

export const invoices = sqliteTable("invoices", {
  id: id(),
  invoiceNumber: text("invoice_number").notNull().unique(),
  customerId: text("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "restrict" }),
  status: text("status", { enum: INVOICE_STATUS }).notNull().default("draft"),
  issueDate: integer("issue_date").notNull(),
  dueDate: integer("due_date").notNull(),
  currency: text("currency").notNull(),
  /** All amounts in minor units. */
  subtotal: integer("subtotal").notNull().default(0),
  /** Tax rate in basis points, e.g. 2500 = 25%. */
  taxRate: integer("tax_rate").notNull().default(0),
  taxAmount: integer("tax_amount").notNull().default(0),
  total: integer("total").notNull().default(0),
  notes: text("notes"),
  pdfPath: text("pdf_path"),
  paidAt: integer("paid_at"),
  kind: text("kind", { enum: INVOICE_KIND }).notNull().default("invoice"),
  /** The seller's details at issue time (JSON SellerSnapshot), so a regenerated PDF never uses later settings. */
  sellerJson: text("seller_json"),
  /** Service period covered by the invoice (first/last billed entry). */
  periodStart: integer("period_start"),
  periodEnd: integer("period_end"),
  /** Credit notes: the invoice this one credits. */
  creditedInvoiceId: text("credited_invoice_id"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [index("invoices_customer_idx").on(table.customerId)]);

/* -------------------------------------------------- invoice_line_items */

export const invoiceLineItems = sqliteTable("invoice_line_items", {
  id: id(),
  invoiceId: text("invoice_id")
    .notNull()
    .references(() => invoices.id, { onDelete: "cascade" }),
  projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
  /** Hourly lines: the task this line bills (one line per task). */
  taskId: text("task_id").references(() => tasks.id, { onDelete: "set null" }),
  /** Subscription lines: the subscription whose month this line bills. */
  subscriptionId: text("subscription_id"),
  description: text("description").notNull(),
  /** Hours for hourly lines, or 1 for fixed-price lines. */
  quantity: real("quantity").notNull().default(1),
  /** Minor units. */
  unitPrice: integer("unit_price").notNull().default(0),
  /** Minor units. */
  amount: integer("amount").notNull().default(0),
  /**
   * Snapshot of the task's individual time entries, JSON-encoded, when the invoice was
   * generated with "include time entries". Kept separate from `description` so task text
   * and time-entry text never share a field. Shape: InvoiceEntrySnapshot[].
   */
  entriesJson: text("entries_json"),
}, (table) => [
  index("invoice_line_items_invoice_idx").on(table.invoiceId),
  index("invoice_line_items_project_idx").on(table.projectId),
]);

/* ----------------------------------------------------- invoice_entries */

/**
 * Which time entries an invoice billed. An entry is billed at most once
 * (unique), and can't be deleted while it is on an invoice (restrict):
 * crediting the invoice releases its entries.
 */
export const invoiceEntries = sqliteTable("invoice_entries", {
  id: id(),
  invoiceId: text("invoice_id")
    .notNull()
    .references(() => invoices.id, { onDelete: "cascade" }),
  timeEntryId: text("time_entry_id")
    .notNull()
    .references(() => timeEntries.id, { onDelete: "restrict" }),
}, (table) => [
  uniqueIndex("invoice_entries_time_entry_unique").on(table.timeEntryId),
  index("invoice_entries_invoice_idx").on(table.invoiceId),
]);

/* ----------------------------------------------------------- task_links */

/** Titled links attached to a task (e.g. "PageSpeed report" -> a Google Docs URL). */
export const taskLinks = sqliteTable("task_links", {
  id: id(),
  taskId: text("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  url: text("url").notNull(),
  position: integer("position").notNull().default(0),
  createdAt: createdAt(),
}, (table) => [index("task_links_task_idx").on(table.taskId)]);

/* ------------------------------------------------------------ settings */

/** Single-row table (id is always "default"). */
export const settings = sqliteTable("settings", {
  id: text("id").primaryKey().default("default"),
  companyName: text("company_name"),
  addressLine1: text("address_line1"),
  addressLine2: text("address_line2"),
  postalCode: text("postal_code"),
  city: text("city"),
  country: text("country"),
  vatNumber: text("vat_number"),
  email: text("email"),
  phone: text("phone"),
  logoPath: text("logo_path"),
  bankName: text("bank_name"),
  bankAccount: text("bank_account"),
  iban: text("iban"),
  swift: text("swift"),
  /** Minor units. */
  defaultHourlyRate: integer("default_hourly_rate").notNull().default(0),
  currency: text("currency").notNull().default("DKK"),
  /** Basis points, e.g. 2500 = 25%. */
  defaultTaxRate: integer("default_tax_rate").notNull().default(2500),
  invoiceNumberPrefix: text("invoice_number_prefix").notNull().default("2026-"),
  /**
   * Moms-registered? A "personlig mindre virksomhed" isn't (until 50.000 kr
   * turnover in 12 months): its invoices carry 0% and say so.
   */
  vatRegistered: integer("vat_registered", { mode: "boolean" }).notNull().default(true),
  /** Folder daily backups are written to; null = backups off. */
  backupDir: text("backup_dir"),
  lastBackupAt: integer("last_backup_at"),
  /** CVR start date; a "personlig mindre virksomhed" renews its registration every 3 years from it. */
  companyRegisteredAt: integer("company_registered_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/* ------------------------------------------------------------ expenses */

/** A purchase for the business, with its receipt (bilag). */
export const expenses = sqliteTable("expenses", {
  id: id(),
  date: integer("date").notNull(),
  supplier: text("supplier").notNull(),
  description: text("description").notNull(),
  category: text("category", { enum: EXPENSE_CATEGORY }).notNull().default("other"),
  /** Minor units: total paid, moms included. */
  amount: integer("amount").notNull(),
  /** Minor units: deductible moms within `amount` (0 while not moms-registered). */
  vatAmount: integer("vat_amount").notNull().default(0),
  currency: text("currency").notNull().default("DKK"),
  /** The receipt, copied into the app's data folder. */
  receiptPath: text("receipt_path"),
  note: text("note"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [index("expenses_date_idx").on(table.date)]);

/* ------------------------------------------------------- subscriptions */

/**
 * A recurring monthly charge for a customer (e.g. hosting). Every month from
 * startMonth (through endMonth, if set) is billed once; billedThrough is the
 * last month already on an invoice. Months are "YYYY-MM".
 */
export const subscriptions = sqliteTable("subscriptions", {
  id: id(),
  customerId: text("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "cascade" }),
  /** The title, e.g. "Hosting" (the column predates the separate description). */
  description: text("description").notNull(),
  /** Optional longer text, printed under the title on the invoice line. */
  details: text("details"),
  /** Minor units per month. */
  amount: integer("amount").notNull(),
  mode: text("mode", { enum: SUBSCRIPTION_MODE }).notNull().default("auto"),
  startMonth: text("start_month").notNull(),
  endMonth: text("end_month"),
  billedThrough: text("billed_through"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [index("subscriptions_customer_idx").on(table.customerId)]);

/* ----------------------------------------------------------- relations */

export const customersRelations = relations(customers, ({ many }) => ({
  projects: many(projects),
  invoices: many(invoices),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  customer: one(customers, { fields: [projects.customerId], references: [customers.id] }),
  tasks: many(tasks),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  project: one(projects, { fields: [tasks.projectId], references: [projects.id] }),
  timeEntries: many(timeEntries),
}));

export const timeEntriesRelations = relations(timeEntries, ({ one }) => ({
  task: one(tasks, { fields: [timeEntries.taskId], references: [tasks.id] }),
}));

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  customer: one(customers, { fields: [invoices.customerId], references: [customers.id] }),
  lineItems: many(invoiceLineItems),
}));

export const invoiceLineItemsRelations = relations(invoiceLineItems, ({ one }) => ({
  invoice: one(invoices, { fields: [invoiceLineItems.invoiceId], references: [invoices.id] }),
  project: one(projects, { fields: [invoiceLineItems.projectId], references: [projects.id] }),
}));

/* --------------------------------------------------------------- types */

export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type TimeEntry = typeof timeEntries.$inferSelect;
export type NewTimeEntry = typeof timeEntries.$inferInsert;
export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;
export type InvoiceLineItem = typeof invoiceLineItems.$inferSelect;
export type NewInvoiceLineItem = typeof invoiceLineItems.$inferInsert;
export type Settings = typeof settings.$inferSelect;
export type NewSettings = typeof settings.$inferInsert;
export type TaskLink = typeof taskLinks.$inferSelect;
export type InvoiceEntry = typeof invoiceEntries.$inferSelect;
export type Expense = typeof expenses.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
export type NewExpense = typeof expenses.$inferInsert;
export type NewTaskLink = typeof taskLinks.$inferInsert;
