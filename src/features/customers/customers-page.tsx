import { useEffect, useState } from "react";
import { Plus, MoreHorizontal, Pencil, Trash2, Building2, Search } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Pagination } from "@/components/pagination";
import { ListTable, ListTableSkeleton } from "@/components/list-table";
import { EmptyState } from "@/components/empty-state";
import { CustomerDot } from "@/components/customer-dot";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { TableCell, TableHead, TableRow } from "@/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/ui/dropdown-menu";
import { CustomerDialog } from "@/features/customers/customer-dialog";
import { usePaginatedCustomers, useDeleteCustomer } from "@/queries/use-customers";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import type { Customer } from "@/db/schema";

const Dash = (): React.JSX.Element => <span className="text-muted-foreground/50">—</span>;

/** All customers: search, edit and delete, each with its colour dot and invoice series. */
export const CustomersPage = (): React.JSX.Element => {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search, 300);

  useEffect(() => setPage(1), [debouncedSearch]);

  const { data, isLoading } = usePaginatedCustomers({ page, search: debouncedSearch });
  const remove = useDeleteCustomer();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | undefined>(undefined);
  const [toDelete, setToDelete] = useState<Customer | undefined>(undefined);

  const customers = data?.rows ?? [];
  const total = data?.total ?? 0;
  const filtering = debouncedSearch.trim().length > 0;

  const openNew = (): void => {
    setEditing(undefined);
    setDialogOpen(true);
  };

  const openEdit = (customer: Customer): void => {
    setEditing(customer);
    setDialogOpen(true);
  };

  return (
    <>
      <PageHeader
        title="Customers"
        description="The people and companies you bill."
        action={
          <Button onClick={openNew}>
            <Plus className="size-4" />
            New customer
          </Button>
        }
      />

      <div className="mb-4">
        <div className="relative w-72 max-w-full">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name, company, or email"
            aria-label="Search customers"
            className="pl-8"
          />
        </div>
      </div>

      {isLoading ? (
        <ListTableSkeleton />
      ) : customers.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={filtering ? "No customers match your search" : "No customers yet"}
          description={
            filtering ? "Try a name, company or email address." : "Add the people and companies you work for."
          }
          action={
            filtering ? (
              <Button variant="outline" onClick={() => setSearch("")}>
                Clear search
              </Button>
            ) : (
              <Button onClick={openNew}>
                <Plus className="size-4" />
                Add your first customer
              </Button>
            )
          }
        />
      ) : (
        <>
          <ListTable
            head={
              <>
                <TableHead>Customer</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>VAT</TableHead>
                <TableHead>Series</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </>
            }
          >
            {customers.map((customer) => (
              <TableRow key={customer.id}>
                <TableCell className="max-w-[20rem]">
                  <button
                    type="button"
                    onClick={() => openEdit(customer)}
                    className="flex max-w-full items-center gap-2.5 rounded-sm text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    <CustomerDot customerId={customer.id} className="size-2.5" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium hover:underline">
                        {customer.companyName ?? customer.name}
                      </span>
                      {customer.companyName ? (
                        <span className="block truncate text-xs text-muted-foreground">{customer.name}</span>
                      ) : null}
                    </span>
                  </button>
                </TableCell>
                <TableCell className="max-w-[16rem] truncate text-muted-foreground">
                  {customer.email ?? <Dash />}
                </TableCell>
                <TableCell className="font-mono text-[13px] tabular-nums text-muted-foreground">
                  {customer.vatNumber ?? <Dash />}
                </TableCell>
                <TableCell>
                  {customer.invoiceCode ? (
                    <span className="inline-flex h-5 items-center rounded-md bg-foreground/[0.05] px-1.5 font-mono text-[11.5px] font-medium dark:bg-foreground/[0.08]">
                      {customer.invoiceCode}
                    </span>
                  ) : (
                    <Dash />
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground"
                        aria-label={`Actions for ${customer.companyName ?? customer.name}`}
                      >
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEdit(customer)}>
                        <Pencil className="size-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onClick={() => setToDelete(customer)}>
                        <Trash2 className="size-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </ListTable>
          <Pagination page={page} total={total} onPageChange={setPage} />
        </>
      )}

      <CustomerDialog open={dialogOpen} onOpenChange={setDialogOpen} customer={editing} />
      <ConfirmDialog
        open={Boolean(toDelete)}
        onOpenChange={(open) => !open && setToDelete(undefined)}
        title={`Delete ${toDelete?.name}?`}
        description="This can't be undone. Customers with projects can't be deleted."
        confirmLabel="Delete"
        onConfirm={() => {
          if (toDelete) {
            remove.mutate({ id: toDelete.id });
            setToDelete(undefined);
          }
        }}
      />
    </>
  );
};
