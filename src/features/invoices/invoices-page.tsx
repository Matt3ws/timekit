import { useEffect, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { Plus, MoreHorizontal, FileText, Loader2, Search, Download, FolderOpen, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Pagination } from "@/components/pagination";
import { ListTable, ListTableSkeleton } from "@/components/list-table";
import { EmptyState } from "@/components/empty-state";
import { CustomerDot, CustomerLabel } from "@/components/customer-dot";
import { SubscriptionBadge } from "@/components/subscription-badge";
import { StatusChip, INVOICE_STATUS_LABELS, displayInvoiceStatus } from "@/components/status-chip";
import { CreateInvoiceDialog } from "@/features/invoices/create-invoice-dialog";
import { useInvoicePdf } from "@/features/invoices/use-invoice-pdf";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { TableCell, TableHead, TableRow } from "@/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/ui/dropdown-menu";
import {
  usePaginatedInvoices,
  useUpdateInvoiceStatus,
  useCreditInvoice,
  type InvoiceWithCustomer,
} from "@/queries/use-invoices";
import { useCustomers } from "@/queries/use-customers";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { formatMoney } from "@/lib/money";
import { INVOICE_STATUS, type InvoiceStatus } from "@/db/schema";

/** Statuses you can set by hand on an issued invoice. Overdue follows from the due date; credited from a credit note. */
const SETTABLE_STATUSES: InvoiceStatus[] = ["sent", "paid"];

const formatDate = (epochMs: number): string => new Date(epochMs).toLocaleDateString("da-DK");

/** All invoices: search and filter, open or save the PDF, mark paid, or credit. Issued invoices are never deleted. */
export const InvoicesPage = (): React.JSX.Element => {
  const [search, setSearch] = useState("");
  const [customerId, setCustomerId] = useState("all");
  const [status, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search, 300);

  useEffect(() => setPage(1), [debouncedSearch, customerId, status]);

  const { data, isLoading } = usePaginatedInvoices({
    page,
    search: debouncedSearch,
    customerId: customerId === "all" ? null : customerId,
    status: status === "all" ? null : (status as InvoiceStatus),
  });
  const { data: customers } = useCustomers();
  const setStatus = useUpdateInvoiceStatus();
  const credit = useCreditInvoice();
  const pdf = useInvoicePdf();
  const [createOpen, setCreateOpen] = useState(false);
  const [createFor, setCreateFor] = useState<string | undefined>(undefined);
  const { newFor } = useSearch({ from: "/invoices" });
  const navigate = useNavigate();

  // Arriving from the subscription reminder: open New invoice for that customer.
  useEffect(() => {
    if (newFor) {
      setCreateFor(newFor);
      setCreateOpen(true);
      void navigate({ to: "/invoices", search: {}, replace: true });
    }
  }, [newFor, navigate]);
  const [toCredit, setToCredit] = useState<InvoiceWithCustomer | undefined>(undefined);

  const invoices = data?.rows ?? [];
  const total = data?.total ?? 0;
  const filtering = debouncedSearch.trim().length > 0 || customerId !== "all" || status !== "all";

  const clearFilters = (): void => {
    setSearch("");
    setCustomerId("all");
    setStatusFilter("all");
  };

  return (
    <>
      <PageHeader
        title="Invoices"
        description="Generate and track invoices."
        action={
          <Button onClick={() => setCreateOpen(true)} className="bg-ember text-ember-foreground shadow-xs hover:bg-ember/90">
            <Plus className="size-4" />
            New invoice
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-64 max-w-full">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by number or customer"
            aria-label="Search invoices"
            className="pl-8"
          />
        </div>
        <Select value={customerId} onValueChange={setCustomerId}>
          <SelectTrigger className="w-48" aria-label="Filter by customer">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All customers</SelectItem>
            {customers?.map((customer) => (
              <SelectItem key={customer.id} value={customer.id}>
                <CustomerDot customerId={customer.id} />
                {customer.companyName ?? customer.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {INVOICE_STATUS.map((value) => (
              <SelectItem key={value} value={value}>
                {INVOICE_STATUS_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <ListTableSkeleton />
      ) : invoices.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={filtering ? "No invoices match your filters" : "No invoices yet"}
          description={
            filtering
              ? "Try another search, customer or status."
              : "Turn unbilled time into an invoice — it picks up every stopped entry not yet billed."
          }
          action={
            filtering ? (
              <Button variant="outline" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : (
              <Button onClick={() => setCreateOpen(true)} className="bg-ember text-ember-foreground hover:bg-ember/90">
                <Plus className="size-4" />
                Create an invoice
              </Button>
            )
          }
        />
      ) : (
        <>
          <ListTable
            head={
              <>
                <TableHead>Number</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </>
            }
          >
            {invoices.map((invoice) => {
              const overdue = displayInvoiceStatus({ status: invoice.status, dueDate: invoice.dueDate }) === "overdue";
              const muted = invoice.status === "cancelled";
              return (
                <TableRow key={invoice.id} className={cn(muted && "text-muted-foreground")}>
                  <TableCell>
                    <span className="flex items-center gap-2">
                      {/* Older invoices have long UUID numbers: truncate, full number on hover. */}
                      <span className="max-w-[11rem] truncate font-mono text-[13px] font-medium" title={invoice.invoiceNumber}>
                        {invoice.invoiceNumber}
                      </span>
                      {invoice.kind === "credit_note" ? (
                        <span className="rounded bg-plum-soft px-1.5 text-[10.5px] font-medium text-plum">Credit note</span>
                      ) : null}
                      {invoice.hasSubscription ? <SubscriptionBadge /> : null}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-[14rem] text-muted-foreground">
                    <CustomerLabel customerId={invoice.customerId} name={invoice.customerName} className="max-w-full" />
                  </TableCell>
                  <TableCell className="font-mono text-[13px] tabular-nums text-muted-foreground">
                    {formatDate(invoice.issueDate)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "font-mono text-[13px] tabular-nums",
                      overdue ? "font-medium text-ember" : "text-muted-foreground",
                    )}
                  >
                    {formatDate(invoice.dueDate)}
                  </TableCell>
                  <TableCell>
                    <StatusChip kind="invoice" status={invoice.status} dueDate={invoice.dueDate} />
                  </TableCell>
                  <TableCell
                    className={cn("text-right font-mono text-[13px] font-medium tabular-nums", muted && "line-through")}
                  >
                    {formatMoney(invoice.total, invoice.currency)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground hover:text-foreground"
                        aria-label={`Open PDF of ${invoice.invoiceNumber}`}
                        title="Open PDF"
                        onClick={() => pdf.open(invoice.id)}
                        disabled={pdf.busyId === invoice.id}
                      >
                        {pdf.busyId === invoice.id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <FileText className="size-3.5" />
                        )}
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 text-muted-foreground"
                            aria-label={`Actions for invoice ${invoice.invoiceNumber}`}
                          >
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem onClick={() => pdf.saveAs(invoice.id)}>
                            <Download className="size-4" />
                            Save PDF as…
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => pdf.reveal(invoice.id)}>
                            <FolderOpen className="size-4" />
                            Show in Finder
                          </DropdownMenuItem>
                          {invoice.kind === "invoice" && invoice.status !== "credited" ? (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuLabel className="label-caps">Status</DropdownMenuLabel>
                              <DropdownMenuRadioGroup
                                value={invoice.status === "paid" ? "paid" : "sent"}
                                onValueChange={(value) =>
                                  setStatus.mutate({ id: invoice.id, status: value as InvoiceStatus })
                                }
                              >
                                {SETTABLE_STATUSES.map((value) => (
                                  <DropdownMenuRadioItem key={value} value={value}>
                                    {INVOICE_STATUS_LABELS[value]}
                                  </DropdownMenuRadioItem>
                                ))}
                              </DropdownMenuRadioGroup>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem variant="destructive" onClick={() => setToCredit(invoice)}>
                                <Undo2 className="size-4" />
                                Credit invoice…
                              </DropdownMenuItem>
                            </>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </ListTable>
          <Pagination page={page} total={total} onPageChange={setPage} />
        </>
      )}

      <CreateInvoiceDialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) {
            setCreateFor(undefined);
          }
        }}
        presetCustomerId={createFor}
      />
      <ConfirmDialog
        open={Boolean(toCredit)}
        onOpenChange={(open) => !open && setToCredit(undefined)}
        title={`Credit invoice ${toCredit?.invoiceNumber}?`}
        description="This issues a credit note (kreditnota) for the full amount with the customer's next invoice number, marks this invoice as credited, and makes its time unbilled again so you can invoice it anew. Issued invoices can't be deleted."
        confirmLabel="Issue credit note"
        onConfirm={() => {
          if (toCredit) {
            credit.mutate({ id: toCredit.id });
            setToCredit(undefined);
          }
        }}
      />
    </>
  );
};
