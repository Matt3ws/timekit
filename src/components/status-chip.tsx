import { cn } from "@/lib/utils";
import type { InvoiceStatus, ProjectStatus } from "@/db/schema";

type ChipTone = "muted" | "success" | "info" | "ember" | "amber" | "plum";

interface ChipStyle {
  label: string;
  tone: ChipTone;
  strike?: boolean;
}

const TONE_CLASS: Record<ChipTone, string> = {
  muted: "bg-muted text-muted-foreground",
  success: "bg-success-soft text-success",
  info: "bg-info-soft text-info",
  ember: "bg-ember-soft text-ember",
  amber: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  plum: "bg-plum-soft text-plum",
};

/** Display labels for invoice statuses. */
export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
  overdue: "Overdue",
  cancelled: "Cancelled",
  credited: "Credited",
};

/** Display labels for project statuses. */
export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  draft: "Draft",
  active: "Active",
  on_hold: "On hold",
  completed: "Completed",
  archived: "Archived",
};

const INVOICE_STYLE: Record<InvoiceStatus, ChipStyle> = {
  draft: { label: INVOICE_STATUS_LABELS.draft, tone: "muted" },
  sent: { label: INVOICE_STATUS_LABELS.sent, tone: "info" },
  paid: { label: INVOICE_STATUS_LABELS.paid, tone: "success" },
  overdue: { label: INVOICE_STATUS_LABELS.overdue, tone: "ember" },
  cancelled: { label: INVOICE_STATUS_LABELS.cancelled, tone: "muted", strike: true },
  credited: { label: INVOICE_STATUS_LABELS.credited, tone: "plum" },
};

const PROJECT_STYLE: Record<ProjectStatus, ChipStyle> = {
  draft: { label: PROJECT_STATUS_LABELS.draft, tone: "muted" },
  active: { label: PROJECT_STATUS_LABELS.active, tone: "success" },
  on_hold: { label: PROJECT_STATUS_LABELS.on_hold, tone: "amber" },
  completed: { label: PROJECT_STATUS_LABELS.completed, tone: "info" },
  archived: { label: PROJECT_STATUS_LABELS.archived, tone: "muted" },
};

interface DisplayInvoiceStatusInput {
  status: InvoiceStatus;
  /** Epoch ms. Without it a "sent" invoice can't be shown as overdue. */
  dueDate?: number;
  now?: number;
}

/** The status to show: a "sent" invoice past its due date reads as Overdue. */
export const displayInvoiceStatus = ({
  status,
  dueDate,
  now = Date.now(),
}: DisplayInvoiceStatusInput): InvoiceStatus =>
  status === "sent" && dueDate !== undefined && dueDate < now ? "overdue" : status;

interface InvoiceChipProps {
  kind: "invoice";
  status: InvoiceStatus;
  /** Epoch ms; lets a past-due "sent" invoice display as Overdue. */
  dueDate?: number;
  className?: string;
}

interface ProjectChipProps {
  kind: "project";
  status: ProjectStatus;
  className?: string;
}

/** Props for {@link StatusChip}: an invoice or a project status. */
export type StatusChipProps = InvoiceChipProps | ProjectChipProps;

const styleFor = (props: StatusChipProps): ChipStyle =>
  props.kind === "invoice"
    ? INVOICE_STYLE[displayInvoiceStatus({ status: props.status, dueDate: props.dueDate })]
    : PROJECT_STYLE[props.status];

/**
 * A small tinted pill with a status dot, shared by invoices and projects so a
 * status looks the same everywhere.
 *
 * @example
 * <StatusChip kind="invoice" status={invoice.status} dueDate={invoice.dueDate} />
 * <StatusChip kind="project" status={project.status} />
 */
export const StatusChip = (props: StatusChipProps): React.JSX.Element => {
  const { label, tone, strike } = styleFor(props);
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2 text-[11.5px] font-medium",
        TONE_CLASS[tone],
        props.className,
      )}
    >
      <span className="size-1.5 shrink-0 rounded-full bg-current opacity-80" aria-hidden />
      <span className={cn(strike && "line-through")}>{label}</span>
    </span>
  );
};
