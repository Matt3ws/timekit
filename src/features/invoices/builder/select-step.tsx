import { useEffect, useState } from "react";
import { ChevronRight, Repeat } from "lucide-react";
import { SubscriptionBadge } from "@/components/subscription-badge";
import { Label } from "@/ui/label";
import { Checkbox } from "@/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/ui/select";
import { billableHours } from "@/lib/billing";
import { customerColor } from "@/lib/customer-color";
import { formatDuration } from "@/lib/duration";
import { formatMoney } from "@/lib/money";
import { monthLabel } from "@/lib/subscriptions";
import { cn } from "@/lib/utils";
import type { Customer } from "@/db/schema";
import type { BillableProject } from "@/queries/use-invoices";
import type { DueSubscription } from "@/queries/use-subscriptions";

interface SelectStepProps {
  customers: Customer[];
  customerId: string;
  /** The default currency, which subscriptions are priced in. */
  currency: string;
  onCustomerChange: (customerId: string) => void;
  work: BillableProject[] | undefined;
  selectedTasks: ReadonlySet<string>;
  selectedFixed: ReadonlySet<string>;
  /** This customer's subscriptions with months not yet invoiced. */
  dueSubscriptions: DueSubscription[];
  selectedSubscriptions: ReadonlySet<string>;
  onToggleSubscription: (subscriptionId: string) => void;
  onToggleTask: (taskId: string) => void;
  onToggleFixed: (projectId: string) => void;
  onToggleProject: (project: BillableProject, selected: boolean) => void;
  includeEntries: boolean;
  onIncludeEntriesChange: (include: boolean) => void;
}

/** Step 1: which customer, and which unbilled work goes on the invoice. */
export const SelectStep = ({
  customers,
  customerId,
  currency,
  onCustomerChange,
  work,
  selectedTasks,
  selectedFixed,
  dueSubscriptions,
  selectedSubscriptions,
  onToggleSubscription,
  onToggleTask,
  onToggleFixed,
  onToggleProject,
  includeEntries,
  onIncludeEntriesChange,
}: SelectStepProps): React.JSX.Element => {
  const billable = (work ?? []).filter(
    (project) => project.tasks.length > 0 || (project.billingType === "fixed" && !project.alreadyBilled),
  );
  const billableKey = billable.map((project) => project.id).join(",");

  // Projects can hold many tasks: each one folds into its header. A single
  // project starts open; with several, they start folded.
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    const ids = billableKey ? billableKey.split(",") : [];
    setExpanded(new Set(ids.length === 1 ? ids : []));
  }, [customerId, billableKey]);

  const toggleExpanded = (projectId: string): void =>
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });

  return (
    <div className="min-w-0 space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="invoice-customer">Customer</Label>
        <Select value={customerId} onValueChange={onCustomerChange}>
          <SelectTrigger id="invoice-customer" className="w-full">
            <SelectValue placeholder="Select a customer" />
          </SelectTrigger>
          <SelectContent>
            {customers.map((customer) => (
              <SelectItem key={customer.id} value={customer.id}>
                <span className="size-2 rounded-full" style={{ background: customerColor(customer.id) }} />
                {customer.companyName ?? customer.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {customerId && dueSubscriptions.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-info/40">
          <div className="flex items-center gap-2 bg-info-soft px-3 py-2 text-info">
            <Repeat className="size-4 shrink-0" />
            <span className="flex-1 text-sm font-medium">Subscriptions due</span>
            <span className="text-[11px]">Each month becomes its own line</span>
          </div>
          <ul className="divide-y divide-border">
            {dueSubscriptions.map((subscription) => {
              const months = subscription.months.map((month) => monthLabel(month, "en"));
              return (
                <li key={subscription.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted/40">
                    <Checkbox
                      checked={selectedSubscriptions.has(subscription.id)}
                      onCheckedChange={() => onToggleSubscription(subscription.id)}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm">{subscription.description}</span>
                        <SubscriptionBadge />
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {months.length > 2 ? `${months[0]} – ${months[months.length - 1]}` : months.join(", ")}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-mono text-sm tabular-nums">
                        {formatMoney(subscription.amount * subscription.months.length, currency)}
                      </div>
                      <div className="font-mono text-[11px] tabular-nums text-muted-foreground">
                        {subscription.months.length} × {formatMoney(subscription.amount, currency)}
                      </div>
                    </div>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {customerId && work && billable.length === 0 && dueSubscriptions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center">
          <p className="text-sm font-medium">Nothing to invoice</p>
          <p className="mt-1 text-xs text-muted-foreground">
            All tracked time for this customer is already on an invoice. You can still add lines by hand in the next step.
          </p>
        </div>
      ) : null}

      {billable.map((project) => {
        const selectable = project.tasks.filter((task) => task.trackedSeconds > 0);
        const selected = selectable.filter((task) => selectedTasks.has(task.id));
        const allSelected = selectable.length > 0 && selected.length === selectable.length;
        const someSelected = selected.length > 0 && !allSelected;
        const selectedAmount = selected.reduce(
          (sum, task) => sum + Math.round(billableHours(task.trackedSeconds) * project.rate),
          0,
        );
        const hourly = project.billingType === "hourly";
        const open = !hourly || expanded.has(project.id);
        return (
          <div key={project.id} className="overflow-hidden rounded-lg border border-border">
            <div className="flex items-center gap-2 bg-muted/50 px-3 py-2">
              {hourly ? (
                <>
                  <Checkbox
                    checked={allSelected ? true : someSelected ? "indeterminate" : false}
                    disabled={selectable.length === 0}
                    onCheckedChange={(checked) => onToggleProject(project, checked === true)}
                    aria-label={`Select all unbilled tasks in ${project.title}`}
                  />
                  <button
                    type="button"
                    onClick={() => toggleExpanded(project.id)}
                    aria-expanded={open}
                    aria-controls={`project-tasks-${project.id}`}
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-sm font-medium"
                  >
                    <ChevronRight
                      className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
                    />
                    <span className="truncate">{project.title}</span>
                  </button>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                    {selected.length} of {selectable.length} {selectable.length === 1 ? "task" : "tasks"} ·{" "}
                    <span className={cn(selectedAmount > 0 && "font-semibold text-foreground")}>
                      {formatMoney(selectedAmount, project.currency)}
                    </span>
                  </span>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{project.title}</span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">Fixed price</span>
                </>
              )}
            </div>

            {project.billingType === "fixed" ? (
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5">
                <Checkbox
                  checked={selectedFixed.has(project.id)}
                  onCheckedChange={() => onToggleFixed(project.id)}
                />
                <span className="flex-1 text-sm">Bill the fixed price</span>
                <span className="font-mono text-sm tabular-nums">
                  {formatMoney(project.fixedPrice ?? 0, project.currency)}
                </span>
              </label>
            ) : open ? (
              <ul id={`project-tasks-${project.id}`} className="divide-y divide-border">
                {project.tasks.map((task) => {
                  const hours = billableHours(task.trackedSeconds);
                  const disabled = task.trackedSeconds === 0;
                  return (
                    <li key={task.id}>
                      <label
                        className={cn(
                          "flex items-center gap-3 px-3 py-2",
                          disabled ? "opacity-60" : "cursor-pointer hover:bg-muted/40",
                        )}
                      >
                        <Checkbox
                          checked={selectedTasks.has(task.id)}
                          disabled={disabled}
                          onCheckedChange={() => onToggleTask(task.id)}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm">{task.title}</div>
                          {task.running ? (
                            <div className="text-[11px] text-ember">
                              Timer running: the current session goes on a later invoice
                            </div>
                          ) : null}
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="font-mono text-sm tabular-nums">
                            {formatMoney(Math.round(hours * project.rate), project.currency)}
                          </div>
                          <div className="font-mono text-[11px] tabular-nums text-muted-foreground">
                            {formatDuration(task.trackedSeconds)} → {hours.toLocaleString("da-DK")} t
                          </div>
                        </div>
                      </label>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        );
      })}

      {customerId ? (
        <label className="flex cursor-pointer items-center gap-2.5 px-1">
          <Checkbox checked={includeEntries} onCheckedChange={(checked) => onIncludeEntriesChange(checked === true)} />
          <span className="text-sm">Add a detailed breakdown of each task&apos;s time entries</span>
        </label>
      ) : null}
    </div>
  );
};
