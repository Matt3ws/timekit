import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Play } from "lucide-react";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { Skeleton } from "@/ui/skeleton";
import { StatCard } from "@/components/stat-card";
import { LiveDuration } from "@/components/live-duration";
import { CreateInvoiceDialog } from "@/features/invoices/create-invoice-dialog";
import { RenewalNotice, TurnoverMeter } from "@/features/dashboard/compliance-cards";
import { SubscriptionsDue } from "@/features/dashboard/subscriptions-due";
import { useInvoices } from "@/queries/use-invoices";
import { useTrackedTotals } from "@/queries/use-stats";
import { useSettings } from "@/queries/use-settings";
import { useActiveTimer, useStartTimer } from "@/queries/use-time-entries";
import { useRecentTasks, useUnbilledByCustomer } from "@/queries/use-dashboard";
import { customerColor } from "@/lib/customer-color";
import { formatDuration } from "@/lib/duration";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

const greeting = (): string => {
  const hour = new Date().getHours();
  return hour < 5 ? "Working late" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
};

const todayLabel = (): string =>
  new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

const SectionTitle = ({ title, action }: { title: string; action?: React.ReactNode }): React.JSX.Element => (
  <div className="mb-2.5 flex items-baseline justify-between">
    <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
    {action}
  </div>
);

/** Money waiting to be invoiced, per customer, with a one-click "Invoice" each. */
const UnbilledCard = ({ onInvoice }: { onInvoice: (customerId: string) => void }): React.JSX.Element => {
  const { data: unbilled, isLoading } = useUnbilledByCustomer();

  if (isLoading) {
    return <Skeleton className="h-40 w-full rounded-xl" />;
  }
  if (!unbilled || unbilled.length === 0) {
    return (
      <Card className="flex h-full flex-col items-center justify-center gap-1 px-6 py-10 text-center">
        <p className="text-sm font-medium">Everything is invoiced</p>
        <p className="text-xs text-muted-foreground">Tracked time shows up here until it is on an invoice.</p>
      </Card>
    );
  }
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <ul className="divide-y divide-border">
        {unbilled.map((row) => (
          <li key={`${row.customerId}:${row.currency}`} className="flex items-center gap-3 px-4 py-3">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: customerColor(row.customerId) }} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{row.customerName}</div>
              {row.seconds > 0 ? (
                <div className="font-mono text-xs tabular-nums text-muted-foreground">
                  {formatDuration(row.seconds)} tracked
                </div>
              ) : null}
            </div>
            <span className="font-mono text-sm font-semibold tabular-nums">{formatMoney(row.amount, row.currency)}</span>
            <Button size="sm" variant="outline" onClick={() => onInvoice(row.customerId)} className="gap-1">
              Invoice
              <ArrowRight className="size-3.5" />
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
};

/** Recently worked-on tasks, each one click from running again. */
const JumpBackIn = (): React.JSX.Element => {
  const { data: recent, isLoading } = useRecentTasks(6);
  const { data: active } = useActiveTimer();
  const start = useStartTimer();

  if (isLoading) {
    return <Skeleton className="h-40 w-full rounded-xl" />;
  }
  if (!recent || recent.length === 0) {
    return (
      <Card className="flex h-full flex-col items-center justify-center gap-1 px-6 py-10 text-center">
        <p className="text-sm font-medium">No open tasks</p>
        <Link to="/projects" className="text-xs text-muted-foreground underline underline-offset-2">
          Open a project to add one and start a timer
        </Link>
      </Card>
    );
  }
  return (
    <Card className="gap-0 overflow-hidden py-1">
      <ul>
        {recent.map((task) => {
          const running = active?.taskId === task.taskId;
          return (
            <li key={task.taskId} className="group flex items-center gap-2.5 px-2 py-1">
              <Button
                size="icon"
                variant="ghost"
                aria-label={running ? `${task.taskTitle} is running` : `Start a timer on ${task.taskTitle}`}
                disabled={running || start.isPending}
                onClick={() => start.mutate({ taskId: task.taskId })}
                className={cn("size-7 shrink-0 text-ember hover:bg-ember-soft hover:text-ember", running && "opacity-100")}
              >
                <Play className="size-3.5 fill-current" />
              </Button>
              <Link
                to="/projects/$projectId"
                params={{ projectId: task.projectId }}
                className="min-w-0 flex-1 py-1"
              >
                <div className="truncate text-sm">{task.taskTitle}</div>
                <div className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                  <span className="size-1.5 shrink-0 rounded-full" style={{ background: customerColor(task.customerId) }} />
                  <span className="truncate">{task.projectTitle}</span>
                </div>
              </Link>
              {running && active ? (
                <LiveDuration
                  startedAt={active.startedAt}
                  baseSeconds={task.trackedSeconds}
                  format="short"
                  className="pr-2 font-mono text-xs font-semibold tabular-nums text-ember"
                />
              ) : (
                <span className="pr-2 font-mono text-xs tabular-nums text-muted-foreground">
                  {formatDuration(task.trackedSeconds)}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
};

export const DashboardPage = (): React.JSX.Element => {
  const { data: settings } = useSettings();
  const { data: totals } = useTrackedTotals();
  const { data: active } = useActiveTimer();
  const { data: invoices } = useInvoices();
  const { data: unbilled } = useUnbilledByCustomer();
  const [invoiceCustomerId, setInvoiceCustomerId] = useState<string | null>(null);

  if (!settings) {
    return <Skeleton className="h-64 w-full" />;
  }

  const currency = settings.currency;
  const now = Date.now();
  const awaiting = (invoices ?? []).filter(
    (invoice) => (invoice.status === "sent" || invoice.status === "overdue") && invoice.currency === currency,
  );
  const overdue = awaiting.filter((invoice) => invoice.status === "overdue" || invoice.dueDate < now);
  const awaitingTotal = awaiting.reduce((sum, invoice) => sum + invoice.total, 0);
  const unbilledHere = (unbilled ?? []).filter((row) => row.currency === currency);
  const unbilledTotal = unbilledHere.reduce((sum, row) => sum + row.amount, 0);
  const unbilledSeconds = unbilledHere.reduce((sum, row) => sum + row.seconds, 0);
  const runningSinceToday = active && active.startedAt >= new Date().setHours(0, 0, 0, 0);

  return (
    <>
      <div className="mb-6">
        <div className="label-caps">{todayLabel()}</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{greeting()}</h1>
      </div>

      <div className="mb-3 empty:hidden">
        <RenewalNotice settings={settings} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Today"
          value={
            runningSinceToday && active ? (
              <LiveDuration startedAt={active.startedAt} baseSeconds={totals?.todaySeconds ?? 0} format="short" />
            ) : (
              formatDuration(totals?.todaySeconds ?? 0)
            )
          }
        />
        <StatCard
          label="This week"
          value={
            active ? (
              <LiveDuration startedAt={active.startedAt} baseSeconds={totals?.weekSeconds ?? 0} format="short" />
            ) : (
              formatDuration(totals?.weekSeconds ?? 0)
            )
          }
        />
        <StatCard
          label="Unbilled"
          tone={unbilledTotal > 0 ? "ember" : "default"}
          value={formatMoney(unbilledTotal, currency)}
          hint={
            unbilledHere.length > 0
              ? `${formatDuration(unbilledSeconds)} across ${unbilledHere.length} customer${unbilledHere.length === 1 ? "" : "s"}`
              : "Nothing waiting"
          }
        />
        <StatCard
          label="Awaiting payment"
          value={formatMoney(awaitingTotal, currency)}
          hint={
            overdue.length > 0 ? (
              <span className="font-medium text-ember">{overdue.length} overdue</span>
            ) : (
              `${awaiting.length} open invoice${awaiting.length === 1 ? "" : "s"}`
            )
          }
        />
      </div>

      <div className="mt-3 empty:hidden">
        <TurnoverMeter settings={settings} unbilled={unbilledTotal} />
      </div>

      <div className="mt-8 empty:hidden">
        <SubscriptionsDue currency={currency} onInvoice={setInvoiceCustomerId} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-5">
        <section className="lg:col-span-3">
          <SectionTitle title="Unbilled by customer" />
          <UnbilledCard onInvoice={setInvoiceCustomerId} />
        </section>
        <section className="lg:col-span-2">
          <SectionTitle
            title="Jump back in"
            action={
              <Link to="/projects" className="text-xs text-muted-foreground transition-colors hover:text-foreground">
                All projects
              </Link>
            }
          />
          <JumpBackIn />
        </section>
      </div>

      <CreateInvoiceDialog
        open={invoiceCustomerId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setInvoiceCustomerId(null);
          }
        }}
        presetCustomerId={invoiceCustomerId ?? undefined}
      />
    </>
  );
};
