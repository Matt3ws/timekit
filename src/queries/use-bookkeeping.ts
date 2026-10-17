import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { and, asc, eq, gte, lt, sql } from "drizzle-orm";
import { toast } from "sonner";
import { invoke } from "@tauri-apps/api/core";
import { appDataDir, extname, join } from "@tauri-apps/api/path";
import { copyFile, exists, mkdir, remove, writeTextFile } from "@tauri-apps/plugin-fs";
import { db } from "@/db/client";
import { customers, expenses, invoices, settings, type Expense, type ExpenseCategory, type Invoice } from "@/db/schema";
import { newId } from "@/lib/ids";
import { getInvoiceDetail } from "@/queries/use-invoices";
import { getSettingsRow } from "@/queries/use-settings";
import { queryKeys } from "@/queries/keys";

/** Turnover limit for a business that isn't moms-registered: 50.000 kr in any 12 months (minor units). */
export const VAT_REGISTRATION_LIMIT = 5_000_000;

const DAY = 24 * 60 * 60 * 1000;
const bookkeepingKey = ["bookkeeping"] as const;

const yearRange = (year: number): { start: number; end: number } => ({
  start: new Date(year, 0, 1).getTime(),
  end: new Date(year + 1, 0, 1).getTime(),
});

/* ------------------------------------------------------------- expenses */

/** A year's expenses, oldest first (the order receipts are numbered in). */
export const useExpenses = (year: number): UseQueryResult<Expense[], Error> =>
  useQuery({
    queryKey: [...bookkeepingKey, "expenses", year],
    queryFn: () => {
      const { start, end } = yearRange(year);
      return db
        .select()
        .from(expenses)
        .where(and(gte(expenses.date, start), lt(expenses.date, end)))
        .orderBy(asc(expenses.date), asc(expenses.createdAt));
    },
  });

export interface ExpenseInput {
  date: number;
  supplier: string;
  description: string;
  category: ExpenseCategory;
  /** Minor units, moms included. */
  amount: number;
  /** Minor units of deductible moms (0 while not moms-registered). */
  vatAmount: number;
  note: string | null;
  /**
   * A receipt file picked from disk, copied into the app's data folder.
   * undefined keeps the current receipt; null removes it.
   */
  receiptSource?: string | null;
}

const receiptsDir = async (): Promise<string> => {
  const dir = await join(await appDataDir(), "receipts");
  if (!(await exists(dir))) {
    await mkdir(dir, { recursive: true });
  }
  return dir;
};

/** Copy a picked receipt next to the database, named after the expense so it can't collide. */
const storeReceipt = async (expenseId: string, source: string): Promise<string> => {
  const extension = await extname(source).catch(() => "pdf");
  const target = await join(await receiptsDir(), `${expenseId}.${extension.toLowerCase()}`);
  await copyFile(source, target);
  return target;
};

const removeReceipt = async (path: string | null): Promise<void> => {
  if (path && (await exists(path).catch(() => false))) {
    await remove(path).catch(() => undefined);
  }
};

const invalidateBookkeeping = (queryClient: ReturnType<typeof useQueryClient>): Promise<void> =>
  queryClient.invalidateQueries({ queryKey: bookkeepingKey });

export const useSaveExpense = (): UseMutationResult<void, Error, ExpenseInput & { id?: string }> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, receiptSource, ...values }): Promise<void> => {
      const now = Date.now();
      if (!id) {
        const expenseId = newId();
        const receiptPath = receiptSource ? await storeReceipt(expenseId, receiptSource) : null;
        await db.insert(expenses).values({ ...values, id: expenseId, receiptPath, createdAt: now, updatedAt: now });
        return;
      }
      const [current] = await db.select().from(expenses).where(eq(expenses.id, id)).limit(1);
      let receiptPath = current?.receiptPath ?? null;
      if (receiptSource !== undefined) {
        await removeReceipt(receiptPath);
        receiptPath = receiptSource ? await storeReceipt(id, receiptSource) : null;
      }
      await db.update(expenses).set({ ...values, receiptPath, updatedAt: now }).where(eq(expenses.id, id));
    },
    onSuccess: async (): Promise<void> => {
      await invalidateBookkeeping(queryClient);
      toast.success("Expense saved");
    },
    onError: (error: Error): void => {
      toast.error(`Couldn't save the expense: ${error.message}`);
    },
  });
};

export const useDeleteExpense = (): UseMutationResult<void, Error, { id: string }> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }): Promise<void> => {
      const [current] = await db.select().from(expenses).where(eq(expenses.id, id)).limit(1);
      await db.delete(expenses).where(eq(expenses.id, id));
      await removeReceipt(current?.receiptPath ?? null);
    },
    onSuccess: async (): Promise<void> => {
      await invalidateBookkeeping(queryClient);
      toast.success("Expense deleted");
    },
    onError: (): void => {
      toast.error("Couldn't delete the expense");
    },
  });
};

/** Years that have invoices or expenses, plus the current year, newest first. */
export const useBookkeepingYears = (): UseQueryResult<number[], Error> =>
  useQuery({
    queryKey: [...bookkeepingKey, "years"],
    queryFn: async (): Promise<number[]> => {
      const rows = await db.all<[number | string]>(sql`
        select distinct cast(strftime('%Y', issue_date / 1000, 'unixepoch', 'localtime') as integer) from invoices
        union
        select distinct cast(strftime('%Y', date / 1000, 'unixepoch', 'localtime') as integer) from expenses
      `);
      const years = new Set<number>([new Date().getFullYear(), ...rows.map((row) => Number(row[0]))]);
      return [...years].filter(Number.isFinite).sort((a, b) => b - a);
    },
  });

/* -------------------------------------------------------------- summary */

export interface YearSummary {
  /** Invoices (and credit notes) issued in the year, minor units. */
  income: { net: number; vat: number; total: number; paid: number; outstanding: number; count: number };
  /** Expenses in the year, minor units; `net` = what the business really paid (total minus deductible moms). */
  expenses: { total: number; vat: number; net: number; count: number; byCategory: Partial<Record<ExpenseCategory, number>> };
  /** Profit before tax: net income minus net expenses. */
  result: number;
  /** Moms to pay for the year (charged minus deductible). 0 while not moms-registered. */
  vatBalance: number;
}

/** Income, expenses and profit for a calendar year: what goes on the tax return. */
export const useYearSummary = (year: number): UseQueryResult<YearSummary, Error> =>
  useQuery({
    queryKey: [...bookkeepingKey, "summary", year],
    queryFn: async (): Promise<YearSummary> => {
      const { start, end } = yearRange(year);
      const invoiceRows = await db
        .select({ subtotal: invoices.subtotal, tax: invoices.taxAmount, total: invoices.total, status: invoices.status })
        .from(invoices)
        .where(and(gte(invoices.issueDate, start), lt(invoices.issueDate, end)));
      const expenseRows = await db
        .select({ amount: expenses.amount, vat: expenses.vatAmount, category: expenses.category })
        .from(expenses)
        .where(and(gte(expenses.date, start), lt(expenses.date, end)));

      const income = invoiceRows.reduce(
        (sum, row) => ({
          net: sum.net + row.subtotal,
          vat: sum.vat + row.tax,
          total: sum.total + row.total,
          paid: sum.paid + (row.status === "paid" ? row.total : 0),
          outstanding: sum.outstanding + (row.status === "sent" || row.status === "overdue" ? row.total : 0),
          count: sum.count + 1,
        }),
        { net: 0, vat: 0, total: 0, paid: 0, outstanding: 0, count: 0 },
      );
      const byCategory: Partial<Record<ExpenseCategory, number>> = {};
      let expenseTotal = 0;
      let expenseVat = 0;
      for (const row of expenseRows) {
        expenseTotal += row.amount;
        expenseVat += row.vat;
        byCategory[row.category] = (byCategory[row.category] ?? 0) + row.amount - row.vat;
      }
      const expenseNet = expenseTotal - expenseVat;
      return {
        income,
        expenses: { total: expenseTotal, vat: expenseVat, net: expenseNet, count: expenseRows.length, byCategory },
        result: income.net - expenseNet,
        vatBalance: income.vat - expenseVat,
      };
    },
  });

/** Turnover (excl. moms) invoiced in the last 365 days, against the 50.000 kr limit. */
export const useRollingTurnover = (): UseQueryResult<number, Error> =>
  useQuery({
    queryKey: [...bookkeepingKey, "turnover-12m"],
    queryFn: async (): Promise<number> => {
      const [row] = await db
        .select({ net: sql<number>`coalesce(sum(${invoices.subtotal}), 0)`.as("turnover_net") })
        .from(invoices)
        .where(gte(invoices.issueDate, Date.now() - 365 * DAY));
      return Number(row?.net ?? 0);
    },
  });

/* --------------------------------------------------------------- export */

const csvCell = (value: string | number | null): string => {
  const text = value === null ? "" : String(value);
  return /[;"\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
const csv = (rows: (string | number | null)[][]): string =>
  // Semicolons and a BOM: opens correctly in Danish Excel/Numbers.
  `﻿${rows.map((row) => row.map(csvCell).join(";")).join("\r\n")}\r\n`;
const kroner = (minor: number): string =>
  (minor / 100).toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });
const isoDate = (ms: number): string => {
  const date = new Date(ms);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const safeName = (text: string): string => text.replace(/[^\p{L}\p{N} ._-]+/gu, "-").slice(0, 60).trim();

/**
 * Everything for a year in one folder, for the tax return or an accountant:
 * income.csv (every invoice), expenses.csv (every expense, numbered), the
 * receipts as receipts/B001 …, and every invoice PDF. Returns the folder.
 */
export const exportYear = async (year: number, parentDir: string): Promise<string> => {
  const { start, end } = yearRange(year);
  const folder = await join(parentDir, `TimeKit bookkeeping ${year}`);
  const receiptsFolder = await join(folder, "receipts");
  const invoicesFolder = await join(folder, "invoices");
  for (const dir of [folder, receiptsFolder, invoicesFolder]) {
    if (!(await exists(dir))) {
      await mkdir(dir, { recursive: true });
    }
  }

  const invoiceRows: (Invoice & { customerName: string })[] = await db
    .select({
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
      customerName: sql<string>`coalesce(customers.company_name, customers.name)`.as("ex_customer_name"),
    })
    .from(invoices)
    .innerJoin(customers, eq(customers.id, invoices.customerId))
    .where(and(gte(invoices.issueDate, start), lt(invoices.issueDate, end)))
    .orderBy(asc(invoices.issueDate));

  await writeTextFile(
    await join(folder, "income.csv"),
    csv([
      ["Date", "Number", "Type", "Customer", "Net (excl. moms)", "Moms", "Total", "Currency", "Status", "Paid on"],
      ...invoiceRows.map((invoice) => [
        isoDate(invoice.issueDate),
        invoice.invoiceNumber,
        invoice.kind === "credit_note" ? "Credit note" : "Invoice",
        invoice.customerName,
        kroner(invoice.subtotal),
        kroner(invoice.taxAmount),
        kroner(invoice.total),
        invoice.currency,
        invoice.status,
        invoice.paidAt ? isoDate(invoice.paidAt) : null,
      ]),
    ]),
  );

  const expenseRows = await db
    .select()
    .from(expenses)
    .where(and(gte(expenses.date, start), lt(expenses.date, end)))
    .orderBy(asc(expenses.date), asc(expenses.createdAt));
  const expenseLines: (string | number | null)[][] = [];
  for (const [index, expense] of expenseRows.entries()) {
    const voucher = `B${String(index + 1).padStart(3, "0")}`;
    let receiptFile: string | null = null;
    if (expense.receiptPath && (await exists(expense.receiptPath).catch(() => false))) {
      const extension = await extname(expense.receiptPath).catch(() => "pdf");
      receiptFile = `${voucher} ${isoDate(expense.date)} ${safeName(expense.supplier)}.${extension}`;
      await copyFile(expense.receiptPath, await join(receiptsFolder, receiptFile));
    }
    expenseLines.push([
      voucher,
      isoDate(expense.date),
      expense.supplier,
      expense.description,
      expense.category,
      kroner(expense.amount),
      kroner(expense.vatAmount),
      kroner(expense.amount - expense.vatAmount),
      receiptFile ?? "MISSING RECEIPT",
      expense.note,
    ]);
  }
  await writeTextFile(
    await join(folder, "expenses.csv"),
    csv([
      ["Voucher", "Date", "Supplier", "Description", "Category", "Total", "Deductible moms", "Net", "Receipt", "Note"],
      ...expenseLines,
    ]),
  );

  // Every invoice PDF, regenerated from the stored invoice data.
  const settingsRow = await getSettingsRow();
  const { renderInvoicePdf, invoiceFileName } = await import("@/features/invoices/save-invoice-pdf");
  const { writeFile } = await import("@tauri-apps/plugin-fs");
  for (const invoice of invoiceRows) {
    const detail = await getInvoiceDetail(invoice.id);
    if (detail) {
      await writeFile(
        await join(invoicesFolder, invoiceFileName(invoice.invoiceNumber)),
        await renderInvoicePdf({ ...detail, settings: settingsRow }),
      );
    }
  }
  return folder;
};

/* -------------------------------------------------------------- backups */

/**
 * Write a consistent copy of the whole database to the backup folder (the
 * `db_backup` command copies schema and rows from the local file or replica,
 * safe while the app is running), then record the time.
 */
export const backupNow = async (dir: string): Promise<string> => {
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ").replace(":", ".");
  const target = await join(dir, `timekit ${stamp}.db`);
  await invoke("db_backup", { target });
  await db.update(settings).set({ lastBackupAt: Date.now() }).where(eq(settings.id, "default"));
  return target;
};

/** Back up silently when the last backup is older than 20 hours (called once at startup). */
export const autoBackupIfDue = async (): Promise<void> => {
  const current = await getSettingsRow();
  if (!current.backupDir || (current.lastBackupAt && Date.now() - current.lastBackupAt < 20 * 60 * 60 * 1000)) {
    return;
  }
  try {
    await backupNow(current.backupDir);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[backup]", error);
    toast.error("Automatic backup failed. Check the backup folder in Settings.");
  }
};

/** Settings keys depend on the backup time; refresh them after a manual backup. */
export const useBackupNow = (): UseMutationResult<string, Error, { dir: string }> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ dir }) => backupNow(dir),
    onSuccess: async (): Promise<void> => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.settings });
      toast.success("Backup saved");
    },
    onError: (error: Error): void => {
      toast.error(`Backup failed: ${error.message}`);
    },
  });
};
