import { useState } from "react";
import { MoreHorizontal, Pencil, Plus, Repeat, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ListTable, ListTableSkeleton } from "@/components/list-table";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CustomerLabel } from "@/components/customer-dot";
import { Button } from "@/ui/button";
import { TableCell, TableHead, TableRow } from "@/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/ui/dropdown-menu";
import { SubscriptionDialog } from "@/features/subscriptions/subscription-dialog";
import { formatMoney } from "@/lib/money";
import { monthKeyOf, monthLabel, monthRange, nextInvoiceMonth } from "@/lib/subscriptions";
import { cn } from "@/lib/utils";
import { useSettings } from "@/queries/use-settings";
import {
  useDeleteSubscription,
  useSubscriptions,
  type SubscriptionWithCustomer,
} from "@/queries/use-subscriptions";

type Status = "active" | "paused" | "ended";

const statusOf = (subscription: SubscriptionWithCustomer): Status => {
  if (nextInvoiceMonth(subscription) === null) {
    return "ended";
  }
  return subscription.active ? "active" : "paused";
};

const STATUS_STYLE: Record<Status, string> = {
  active: "bg-success-soft text-success",
  paused: "bg-muted text-muted-foreground",
  ended: "bg-muted text-muted-foreground line-through",
};

const STATUS_LABEL: Record<Status, string> = { active: "Active", paused: "Paused", ended: "Ended" };

/** When the next invoice goes out: "Due now", or the 1st of the next month to bill. */
const nextInvoiceLabel = (subscription: SubscriptionWithCustomer): string => {
  const next = nextInvoiceMonth(subscription);
  if (!next || !subscription.active) {
    return "—";
  }
  if (next <= monthKeyOf(Date.now())) {
    return "Due now";
  }
  return new Date(monthRange(next).start).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

/** Every recurring monthly charge, across customers. */
export const SubscriptionsPage = (): React.JSX.Element => {
  const { data: subscriptions, isLoading } = useSubscriptions();
  const { data: settings } = useSettings();
  const remove = useDeleteSubscription();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SubscriptionWithCustomer | undefined>(undefined);
  const [toDelete, setToDelete] = useState<SubscriptionWithCustomer | undefined>(undefined);
  const currency = settings?.currency ?? "DKK";
  const rows = subscriptions ?? [];
  const monthly = rows
    .filter((subscription) => statusOf(subscription) === "active")
    .reduce((sum, subscription) => sum + subscription.amount, 0);

  const openNew = (): void => {
    setEditing(undefined);
    setDialogOpen(true);
  };

  const openEdit = (subscription: SubscriptionWithCustomer): void => {
    setEditing(subscription);
    setDialogOpen(true);
  };

  return (
    <>
      <PageHeader
        title="Subscriptions"
        description={
          rows.length > 0
            ? `Monthly charges, due on the 1st · ${formatMoney(monthly, currency)} per month from active subscriptions.`
            : "Monthly charges, due on the 1st, e.g. hosting."
        }
        action={
          <Button onClick={openNew}>
            <Plus className="size-4" />
            New subscription
          </Button>
        }
      />

      {isLoading ? (
        <ListTableSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Repeat}
          title="No subscriptions yet"
          description="From the 1st of each month, TimeKit reminds you and preselects the month in New invoice."
          action={
            <Button onClick={openNew}>
              <Plus className="size-4" />
              Create your first subscription
            </Button>
          }
        />
      ) : (
        <ListTable
          head={
            <>
              <TableHead>Subscription</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Last billed</TableHead>
              <TableHead>Next invoice</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Per month</TableHead>
              <TableHead className="w-12">
                <span className="sr-only">Actions</span>
              </TableHead>
            </>
          }
        >
          {rows.map((subscription) => {
            const status = statusOf(subscription);
            const next = nextInvoiceLabel(subscription);
            return (
              <TableRow key={subscription.id} className={cn(status !== "active" && "text-muted-foreground")}>
                <TableCell className="max-w-[16rem]">
                  <button
                    type="button"
                    onClick={() => openEdit(subscription)}
                    className="block truncate text-left font-medium hover:underline"
                  >
                    {subscription.description}
                  </button>
                  {subscription.details ? (
                    <div className="truncate text-xs text-muted-foreground" title={subscription.details}>
                      {subscription.details}
                    </div>
                  ) : null}
                  <div className="truncate text-xs text-muted-foreground">
                    From {monthLabel(subscription.startMonth, "en")}
                    {subscription.endMonth ? ` to ${monthLabel(subscription.endMonth, "en")}` : ""}
                  </div>
                </TableCell>
                <TableCell className="max-w-[12rem]">
                  <CustomerLabel customerId={subscription.customerId} name={subscription.customerName} className="max-w-full" />
                </TableCell>
                <TableCell className="text-sm">
                  {subscription.billedThrough ? monthLabel(subscription.billedThrough, "en") : "Not yet"}
                </TableCell>
                <TableCell className={cn("text-sm", next === "Due now" && "font-medium text-ember")}>{next}</TableCell>
                <TableCell>
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS_STYLE[status])}>
                    {STATUS_LABEL[status]}
                  </span>
                </TableCell>
                <TableCell className="text-right font-mono text-[13px] font-medium tabular-nums">
                  {formatMoney(subscription.amount, currency)}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground"
                        aria-label={`Actions for ${subscription.description}`}
                      >
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEdit(subscription)}>
                        <Pencil className="size-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onClick={() => setToDelete(subscription)}>
                        <Trash2 className="size-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
        </ListTable>
      )}

      <SubscriptionDialog open={dialogOpen} onOpenChange={setDialogOpen} subscription={editing} />
      <ConfirmDialog
        open={toDelete !== undefined}
        onOpenChange={(open) => !open && setToDelete(undefined)}
        title={`Delete ${toDelete?.description ?? "subscription"}?`}
        description="No more months will be invoiced. Invoices already issued are kept. To stop it for a while, pause it instead."
        confirmLabel="Delete"
        destructive
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
