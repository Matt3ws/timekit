import { useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, Plus, FileText, Pencil, FileDown, ChevronRight, ListTodo, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { Skeleton } from "@/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatusChip } from "@/components/status-chip";
import { CustomerLabel } from "@/components/customer-dot";
import { EmptyState } from "@/components/empty-state";
import { LiveDuration } from "@/components/live-duration";
import { ProjectDialog } from "@/features/projects/project-dialog";
import { TaskDialog } from "@/features/tasks/task-dialog";
import { TaskItem } from "@/features/tasks/task-item";
import { CreateInvoiceDialog } from "@/features/invoices/create-invoice-dialog";
import { useInvoicePdf } from "@/features/invoices/use-invoice-pdf";
import { useProject } from "@/queries/use-projects";
import { useCustomer } from "@/queries/use-customers";
import { useTasks } from "@/queries/use-tasks";
import { useActiveTimer } from "@/queries/use-time-entries";
import { useSettings } from "@/queries/use-settings";
import {
  useProjectInvoices,
} from "@/queries/use-invoices";
import { effectiveCurrency, effectiveHourlyRate, unbilledAmount } from "@/lib/billing";
import { formatDuration } from "@/lib/duration";
import { formatMoney } from "@/lib/money";

const formatDate = (epochMs: number): string => new Date(epochMs).toLocaleDateString("da-DK");

interface EstimateBarProps {
  trackedSeconds: number;
  estimatedSeconds: number;
}

/** Thin progress bar; turns ember once tracked time passes the estimate. */
const EstimateBar = ({ trackedSeconds, estimatedSeconds }: EstimateBarProps): React.JSX.Element => {
  const ratio = estimatedSeconds > 0 ? trackedSeconds / estimatedSeconds : 0;
  return (
    <div
      className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-foreground/[0.07]"
      role="progressbar"
      aria-label="Tracked time against the estimate"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(ratio * 100)}
    >
      <div
        className={cn("h-full rounded-full transition-[width]", ratio > 1 ? "bg-ember" : "bg-success")}
        style={{ width: `${Math.min(100, ratio * 100)}%` }}
      />
    </div>
  );
};

/** One project: its figures, its tasks (open first, done collapsed) and its invoices. */
export const ProjectDetailPage = (): React.JSX.Element => {
  const { projectId } = useParams({ from: "/projects/$projectId" });
  const { data: project, isLoading } = useProject(projectId);
  const { data: customer } = useCustomer(project?.customerId);
  const { data: tasks } = useTasks(projectId);
  const { data: settings } = useSettings();
  const { data: projectInvoices } = useProjectInvoices(projectId);
  const { data: active } = useActiveTimer();

  const [editOpen, setEditOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [showDone, setShowDone] = useState(false);

  const pdf = useInvoicePdf();

  if (project === null) {
    return (
      <EmptyState
        icon={ListTodo}
        title="This project doesn't exist anymore"
        className="mt-16"
        action={
          <Button variant="outline" asChild>
            <Link to="/projects">
              <ArrowLeft className="size-4" />
              Back to projects
            </Link>
          </Button>
        }
      />
    );
  }
  if (isLoading || !project || !settings) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-16 w-1/2" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-[76px] rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  const allTasks = tasks ?? [];
  const trackedSeconds = allTasks.reduce((sum, t) => sum + t.trackedSeconds, 0);
  const unbilledSeconds = allTasks.reduce((sum, t) => sum + t.unbilledSeconds, 0);
  // Unbilled only, each task rounded up to 15 min on its own — what the next invoice will charge.
  const billableAmount =
    project.billingType === "fixed"
      ? projectInvoices && projectInvoices.length > 0
        ? 0
        : (project.fixedPrice ?? 0)
      : unbilledAmount(
          allTasks.map((task) => task.unbilledSeconds),
          effectiveHourlyRate(project, settings),
        );
  const currency = effectiveCurrency(project, settings);
  const runningHere = active && active.projectId === project.id ? active : undefined;
  const lastInvoice = projectInvoices && projectInvoices.length > 0 ? projectInvoices[0] : undefined;

  const openTasks = allTasks.filter((task) => task.status !== "done");
  const doneTasks = allTasks.filter((task) => task.status === "done");
  const estimatedSeconds = project.estimatedMinutes ? project.estimatedMinutes * 60 : 0;

  return (
    <>
      <Link
        to="/projects"
        className="mb-4 inline-flex items-center gap-1 rounded-sm text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <ArrowLeft className="size-4" />
        Projects
      </Link>

      <PageHeader
        title={project.title}
        eyebrow={
          <CustomerLabel
            customerId={project.customerId}
            name={customer ? (customer.companyName ?? customer.name) : "…"}
            className="font-medium text-foreground/80"
          />
        }
        description={
          <span className="flex items-center gap-2">
            <StatusChip kind="project" status={project.status} />
            <span>{project.billingType === "fixed" ? "Fixed price" : "Hourly"}</span>
          </span>
        }
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="size-4" />
              Edit
            </Button>
            <Button
              onClick={() => setInvoiceOpen(true)}
              className="bg-ember text-ember-foreground shadow-xs hover:bg-ember/90"
            >
              <FileText className="size-4" />
              Generate invoice
            </Button>
          </div>
        }
      />

      <div className={cn("mb-6 grid grid-cols-2 gap-3", estimatedSeconds > 0 ? "md:grid-cols-4" : "md:grid-cols-3")}>
        <StatCard
          label="Tracked"
          value={
            runningHere ? (
              <LiveDuration startedAt={runningHere.startedAt} baseSeconds={trackedSeconds} format="short" />
            ) : (
              formatDuration(trackedSeconds)
            )
          }
          hint={unbilledSeconds > 0 ? `${formatDuration(unbilledSeconds)} not invoiced yet` : "All time invoiced"}
        />
        <StatCard
          label="Unbilled"
          tone={billableAmount > 0 ? "ember" : "default"}
          value={formatMoney(billableAmount, currency)}
          hint={lastInvoice ? `Last invoiced ${formatDate(lastInvoice.issueDate)}` : "Not invoiced yet"}
        />
        {project.billingType === "fixed" ? (
          <StatCard label="Fixed price" value={formatMoney(project.fixedPrice ?? 0, currency)} hint="Flat fee" />
        ) : (
          <StatCard
            label="Rate"
            value={formatMoney(effectiveHourlyRate(project, settings), currency)}
            hint={project.hourlyRate === null ? "Per hour · default rate" : "Per hour"}
          />
        )}
        {estimatedSeconds > 0 ? (
          <StatCard
            label="Estimate"
            value={`${Math.round((trackedSeconds / estimatedSeconds) * 100)}%`}
            hint={`${formatDuration(trackedSeconds)} of ${formatDuration(estimatedSeconds)}`}
          >
            <EstimateBar trackedSeconds={trackedSeconds} estimatedSeconds={estimatedSeconds} />
          </StatCard>
        ) : null}
      </div>

      {project.description ? (
        <p className="mb-6 max-w-prose whitespace-pre-line text-sm text-muted-foreground">{project.description}</p>
      ) : null}

      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold tracking-tight">Tasks</h2>
          {allTasks.length > 0 ? (
            <span className="font-mono text-xs tabular-nums text-muted-foreground">{openTasks.length} open</span>
          ) : null}
        </div>
        <Button size="sm" variant="outline" onClick={() => setTaskOpen(true)}>
          <Plus className="size-4" />
          Add task
        </Button>
      </div>

      {allTasks.length === 0 ? (
        <EmptyState
          icon={ListTodo}
          title="No tasks yet — add the first one"
          description="Tasks hold your tracked time. Add one, then press Start."
          action={
            <Button onClick={() => setTaskOpen(true)}>
              <Plus className="size-4" />
              Add task
            </Button>
          }
        />
      ) : (
        <div className="space-y-6">
          {openTasks.length > 0 ? (
            <div className="space-y-1.5">
              {openTasks.map((task) => (
                <TaskItem key={task.id} task={task} projectId={project.id} />
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
              <CheckCircle2 className="size-4 text-success" />
              Every task is done.
            </div>
          )}

          {doneTasks.length > 0 ? (
            <div>
              <button
                type="button"
                aria-expanded={showDone}
                onClick={() => setShowDone((value) => !value)}
                className="group mb-1.5 flex items-center gap-1.5 rounded-sm text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <ChevronRight className={cn("size-3.5 transition-transform", showDone && "rotate-90")} aria-hidden />
                <span className="label-caps group-hover:text-foreground">Done</span>
                <span className="font-mono tabular-nums">({doneTasks.length})</span>
              </button>
              {showDone ? (
                <div className="space-y-1.5">
                  {doneTasks.map((task) => (
                    <TaskItem key={task.id} task={task} projectId={project.id} />
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      )}

      {projectInvoices && projectInvoices.length > 0 ? (
        <section className="mt-10">
          <h2 className="mb-3 text-sm font-semibold tracking-tight">Invoices</h2>
          <Card className="gap-0 overflow-hidden py-0 shadow-none">
            <ul className="divide-y divide-border">
              {projectInvoices.map((invoice) => (
                <li key={invoice.id} className="flex items-center gap-4 px-4 py-2.5 transition-colors hover:bg-muted/50">
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-sm font-medium">{invoice.invoiceNumber}</div>
                    <div className="font-mono text-xs tabular-nums text-muted-foreground">
                      {formatDate(invoice.issueDate)}
                    </div>
                  </div>
                  <StatusChip kind="invoice" status={invoice.status} dueDate={invoice.dueDate} />
                  <span className="w-28 text-right font-mono text-sm tabular-nums">
                    {formatMoney(invoice.total, invoice.currency)}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => pdf.open(invoice.id)}
                    disabled={pdf.busyId === invoice.id}>
                    <FileDown className="size-4" />
                    Open PDF
                  </Button>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ) : null}

      <ProjectDialog open={editOpen} onOpenChange={setEditOpen} project={project} />
      <TaskDialog open={taskOpen} onOpenChange={setTaskOpen} projectId={project.id} />
      <CreateInvoiceDialog
        open={invoiceOpen}
        onOpenChange={setInvoiceOpen}
        presetCustomerId={project.customerId}
        presetProjectIds={[project.id]}
      />
    </>
  );
};
