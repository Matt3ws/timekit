import { useMemo, useState } from "react";
import { open as openFolderDialog } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";
import { AlertTriangle, FolderDown, Loader2, MoreHorizontal, Paperclip, Pencil, Plus, Receipt, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { ListTable, ListTableSkeleton } from "@/components/list-table";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CustomerLabel } from "@/components/customer-dot";
import { StatusChip, displayInvoiceStatus } from "@/components/status-chip";
import { ExpenseDialog } from "@/features/bookkeeping/expense-dialog";
import { openReceipt } from "@/features/bookkeeping/receipts";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { Skeleton } from "@/ui/skeleton";
import { TableCell, TableHead, TableRow } from "@/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/ui/dropdown-menu";
import {
  exportYear,
  useBookkeepingYears,
  useDeleteExpense,
  useExpenses,
  useYearSummary,
  type YearSummary,
} from "@/queries/use-bookkeeping";
import { useInvoices, type InvoiceWithCustomer } from "@/queries/use-invoices";
import { useSettings } from "@/queries/use-settings";
import { nextRegistrationRenewal } from "@/lib/billing";
import { formatMoney } from "@/lib/money";
import { EXPENSE_CATEGORY_LABELS, type Expense, type ExpenseCategory, type Settings } from "@/db/schema";

const DAY = 24 * 60 * 60 * 1000;
/** Show the registration renewal in ember from this many days before. */
const RENEWAL_WARNING_DAYS = 90;

const formatDate = (epochMs: number): string => new Date(epochMs).toLocaleDateString("da-DK");
const formatLongDate = (epochMs: number): string =>
  new Date(epochMs).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

/** Voucher (bilag) number: position in the year by date, exactly as the export names them. */
const voucherNumber = (index: number): string => `B${String(index + 1).padStart(3, "0")}`;

const showInFinder = async (path: string): Promise<void> => {
  try {
    await revealItemInDir(path);
  } catch {
    toast.error(`Couldn't open Finder. The export is in ${path}`);
  }
};

const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? "" : "s"}`;

interface YearOptionsInput {
  invoices: InvoiceWithCustomer[] | undefined;
  settings: Settings | undefined;
  currentYear: number;
}

/**
 * Every year from the first bookkeeping year (registration or first invoice)
 * to now, newest first. A contiguous range also covers years that only have
 * expenses.
 */
const yearOptions = ({ invoices, settings, currentYear }: YearOptionsInput): number[] => {
  const starts = [currentYear, ...(invoices ?? []).map((invoice) => new Date(invoice.issueDate).getFullYear())];
  if (settings?.companyRegisteredAt) {
    starts.push(new Date(settings.companyRegisteredAt).getFullYear());
  }
  const first = Math.min(...starts);
  return Array.from({ length: currentYear - first + 1 }, (_, index) => currentYear - index);
};

const SectionTitle = ({ title, action }: { title: string; action?: React.ReactNode }): React.JSX.Element => (
  <div className="mb-2.5 flex items-baseline justify-between gap-3">
    <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
    {action}
  </div>
);

const MissingReceiptChip = (): React.JSX.Element => (
  <span className="inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-full bg-amber-500/15 px-2 text-[11.5px] font-medium text-amber-700 dark:text-amber-400">
    <AlertTriangle className="size-3" aria-hidden />
    Missing receipt
  </span>
);

interface SummaryCardsProps {
  summary: YearSummary;
  invoices: InvoiceWithCustomer[];
  expenses: Expense[];
  settings: Settings;
}

/** Income, expenses, result, and moms to pay (moms-registered) or the registration renewal. */
const SummaryCards = ({ summary, invoices, expenses, settings }: SummaryCardsProps): React.JSX.Element => {
  const money = (minor: number): string => formatMoney(minor, settings.currency);
  const unpaid = invoices.filter((invoice) => {
    const status = displayInvoiceStatus({ status: invoice.status, dueDate: invoice.dueDate });
    return status === "sent" || status === "overdue";
  }).length;
  const missingReceipts = expenses.filter((expense) => !expense.receiptPath).length;
  const renewal = settings.companyRegisteredAt ? nextRegistrationRenewal(settings.companyRegisteredAt) : null;
  const daysToRenewal = renewal === null ? null : Math.ceil((renewal - Date.now()) / DAY);
  const showRenewal = !settings.vatRegistered && renewal !== null && daysToRenewal !== null;
  const cardCount = settings.vatRegistered || showRenewal ? 4 : 3;

  return (
    <div className={cn("mb-8 grid gap-3", cardCount === 4 ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-3")}>
      <StatCard
        label="Income"
        value={money(summary.income.net)}
        hint={`${plural(summary.income.count, "invoice")} · ${unpaid} unpaid`}
      />
      <StatCard
        label="Expenses"
        value={money(summary.expenses.net)}
        hint={
          missingReceipts > 0 ? (
            <span className="text-amber-700 dark:text-amber-400">
              {plural(summary.expenses.count, "expense")} · {missingReceipts} missing receipt
              {missingReceipts === 1 ? "" : "s"}
            </span>
          ) : (
            plural(summary.expenses.count, "expense")
          )
        }
      />
      <StatCard label="Result" value={money(summary.result)} hint="before tax" />
      {settings.vatRegistered ? (
        <StatCard label="Moms to pay" value={money(summary.vatBalance)} hint="charged minus deductible" />
      ) : showRenewal ? (
        <StatCard
          label="Registration renews"
          value={<span className="text-[18px]">{formatLongDate(renewal)}</span>}
          hint={daysToRenewal <= 0 ? "Renew on virk.dk now" : `in ${plural(daysToRenewal, "day")} · on virk.dk`}
          tone={daysToRenewal <= RENEWAL_WARNING_DAYS ? "ember" : "default"}
        />
      ) : null}
    </div>
  );
};

interface CategoryBreakdownProps {
  byCategory: Partial<Record<ExpenseCategory, number>>;
  currency: string;
}

/** Net expenses per category, largest first, as simple bars. */
const CategoryBreakdown = ({ byCategory, currency }: CategoryBreakdownProps): React.JSX.Element => {
  const rows = (Object.entries(byCategory) as [ExpenseCategory, number][])
    .filter(([, amount]) => amount !== 0)
    .sort(([, a], [, b]) => b - a);
  const max = Math.max(1, ...rows.map(([, amount]) => amount));

  if (rows.length === 0) {
    return (
      <Card className="px-4 py-8 text-center text-sm text-muted-foreground shadow-none">No expenses this year.</Card>
    );
  }
  return (
    <Card className="gap-3.5 px-4 py-4 shadow-none">
      {rows.map(([category, amount]) => (
        <div key={category} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate">{EXPENSE_CATEGORY_LABELS[category]}</span>
            <span className="font-mono text-[13px] tabular-nums">{formatMoney(amount, currency)}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div className="h-full rounded-full bg-info" style={{ width: `${Math.max(2, (amount / max) * 100)}%` }} />
          </div>
        </div>
      ))}
    </Card>
  );
};

/**
 * The year's books: income (issued invoices), expenses with their receipts,
 * the result before tax, and an export of everything for the tax return.
 */
export const BookkeepingPage = (): React.JSX.Element => {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const { data: settings } = useSettings();
  const { data: allInvoices } = useInvoices();
  const { data: expenses, isLoading: expensesLoading } = useExpenses(year);
  const { data: summary } = useYearSummary(year);
  const deleteExpense = useDeleteExpense();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | undefined>(undefined);
  const [toDelete, setToDelete] = useState<Expense | undefined>(undefined);
  const [exporting, setExporting] = useState(false);

  // Years with invoices or expenses, plus the contiguous range since registration.
  const { data: dataYears } = useBookkeepingYears();
  const years = useMemo(
    () =>
      [...new Set([...(dataYears ?? []), ...yearOptions({ invoices: allInvoices, settings, currentYear })])].sort(
        (a, b) => b - a,
      ),
    [dataYears, allInvoices, settings, currentYear],
  );
  const yearInvoices = useMemo(
    () =>
      (allInvoices ?? [])
        .filter((invoice) => new Date(invoice.issueDate).getFullYear() === year)
        .sort((a, b) => a.issueDate - b.issueDate),
    [allInvoices, year],
  );
  const currency = settings?.currency ?? "DKK";

  const openNew = (): void => {
    setEditing(undefined);
    setDialogOpen(true);
  };

  const openEdit = (expense: Expense): void => {
    setEditing(expense);
    setDialogOpen(true);
  };

  const onExport = async (): Promise<void> => {
    const parent = await openFolderDialog({ directory: true, title: `Export ${year} to…` });
    if (!parent) {
      return;
    }
    setExporting(true);
    try {
      const folder = await exportYear(year, parent);
      toast.success(`Exported ${year}`, {
        description: "Income, expenses, receipts and every invoice PDF.",
        action: { label: "Show in Finder", onClick: () => void showInFinder(folder) },
      });
    } catch (error) {
      toast.error(`Export failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Bookkeeping"
        description="Income, expenses and receipts for the tax return. Keep everything for 5 years."
        action={
          <div className="flex items-center gap-2">
            <Select value={String(year)} onValueChange={(value) => setYear(Number(value))}>
              <SelectTrigger className="w-28 font-mono tabular-nums" aria-label="Year">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map((option) => (
                  <SelectItem key={option} value={String(option)} className="font-mono tabular-nums">
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={onExport} disabled={exporting}>
              {exporting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <FolderDown className="size-4" />}
              {exporting ? "Exporting…" : "Export year…"}
            </Button>
          </div>
        }
      />

      {summary && settings && expenses ? (
        <SummaryCards summary={summary} invoices={yearInvoices} expenses={expenses} settings={settings} />
      ) : (
        <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-[86px] rounded-xl" />
          ))}
        </div>
      )}

      <section className="mb-8">
        <SectionTitle
          title="Expenses"
          action={
            expenses && expenses.length > 0 ? (
              <Button size="sm" onClick={openNew}>
                <Plus className="size-4" />
                Add expense
              </Button>
            ) : null
          }
        />
        {expensesLoading ? (
          <ListTableSkeleton rows={4} />
        ) : !expenses || expenses.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title={`No expenses in ${year}`}
            description="Record software, hardware, travel and other business costs with their receipts. They lower your taxable result."
            action={
              <Button onClick={openNew}>
                <Plus className="size-4" />
                Add expense
              </Button>
            }
          />
        ) : (
          <ListTable
            head={
              <>
                <TableHead className="w-16">Voucher</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Receipt</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </>
            }
          >
            {expenses.map((expense, index) => {
              const voucher = voucherNumber(index);
              const { receiptPath } = expense;
              return (
                <TableRow key={expense.id}>
                  <TableCell className="font-mono text-[13px] font-medium tabular-nums">{voucher}</TableCell>
                  <TableCell className="font-mono text-[13px] tabular-nums text-muted-foreground">
                    {formatDate(expense.date)}
                  </TableCell>
                  <TableCell className="max-w-[10rem] truncate font-medium" title={expense.supplier}>
                    {expense.supplier}
                  </TableCell>
                  <TableCell className="max-w-[16rem] truncate text-muted-foreground" title={expense.description}>
                    {expense.description}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {EXPENSE_CATEGORY_LABELS[expense.category]}
                  </TableCell>
                  <TableCell className="text-right font-mono text-[13px] tabular-nums">
                    <div className="font-medium">{formatMoney(expense.amount, expense.currency)}</div>
                    {expense.vatAmount > 0 ? (
                      <div className="text-[11.5px] text-muted-foreground">
                        moms {formatMoney(expense.vatAmount, expense.currency)}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {receiptPath ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
                        aria-label={`Open receipt for ${voucher}`}
                        onClick={() => openReceipt(receiptPath)}
                      >
                        <Paperclip className="size-3.5" />
                        Open
                      </Button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openEdit(expense)}
                        aria-label={`Attach the missing receipt for ${voucher}`}
                        title="Attach the receipt"
                      >
                        <MissingReceiptChip />
                      </button>
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-muted-foreground"
                          aria-label={`Actions for ${voucher}`}
                        >
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
                        <DropdownMenuItem onClick={() => openEdit(expense)}>
                          <Pencil className="size-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onClick={() => setToDelete(expense)}>
                          <Trash2 className="size-4" />
                          Delete…
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </ListTable>
        )}
      </section>

      <div className="grid gap-8 xl:grid-cols-[2fr_1fr]">
        <section className="min-w-0">
          <SectionTitle title="Income" />
          {!allInvoices ? (
            <ListTableSkeleton rows={4} />
          ) : yearInvoices.length === 0 ? (
            <Card className="px-4 py-8 text-center text-sm text-muted-foreground shadow-none">
              No invoices issued in {year}.
            </Card>
          ) : (
            <ListTable
              head={
                <>
                  <TableHead>Number</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Issued</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </>
              }
            >
              {yearInvoices.map((invoice) => {
                const muted = invoice.status === "cancelled";
                return (
                  <TableRow key={invoice.id} className={cn(muted && "text-muted-foreground")}>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        <span
                          className="max-w-[10rem] truncate font-mono text-[13px] font-medium"
                          title={invoice.invoiceNumber}
                        >
                          {invoice.invoiceNumber}
                        </span>
                        {invoice.kind === "credit_note" ? (
                          <span className="rounded bg-plum-soft px-1.5 text-[10.5px] font-medium text-plum">
                            Credit note
                          </span>
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[12rem] text-muted-foreground">
                      <CustomerLabel customerId={invoice.customerId} name={invoice.customerName} className="max-w-full" />
                    </TableCell>
                    <TableCell className="font-mono text-[13px] tabular-nums text-muted-foreground">
                      {formatDate(invoice.issueDate)}
                    </TableCell>
                    <TableCell>
                      <StatusChip kind="invoice" status={invoice.status} dueDate={invoice.dueDate} />
                    </TableCell>
                    <TableCell className="text-right font-mono text-[13px] tabular-nums text-muted-foreground">
                      {formatMoney(invoice.subtotal, invoice.currency)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-[13px] font-medium tabular-nums">
                      {formatMoney(invoice.total, invoice.currency)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </ListTable>
          )}
        </section>

        <section className="min-w-0">
          <SectionTitle title="Expenses by category" />
          {summary ? (
            <CategoryBreakdown byCategory={summary.expenses.byCategory} currency={currency} />
          ) : (
            <Skeleton className="h-40 w-full rounded-xl" />
          )}
        </section>
      </div>

      <ExpenseDialog open={dialogOpen} onOpenChange={setDialogOpen} expense={editing} />
      <ConfirmDialog
        open={Boolean(toDelete)}
        onOpenChange={(open) => !open && setToDelete(undefined)}
        title={`Delete expense from ${toDelete?.supplier ?? ""}?`}
        description="The expense and its stored receipt are deleted. Only delete expenses entered by mistake: bookkeeping must be kept for 5 years."
        confirmLabel="Delete expense"
        onConfirm={() => {
          if (toDelete) {
            deleteExpense.mutate({ id: toDelete.id });
            setToDelete(undefined);
          }
        }}
      />
    </>
  );
};
