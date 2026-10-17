import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

/** A calm, centred placeholder for an empty list: icon tile, title, hint and an optional action. */
export const EmptyState = ({ icon: Icon, title, description, action, className }: EmptyStateProps): React.JSX.Element => (
  <div
    className={cn(
      "flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/50 px-6 py-14 text-center",
      className,
    )}
  >
    <span className="flex size-10 items-center justify-center rounded-xl bg-foreground/[0.05] text-muted-foreground dark:bg-foreground/[0.08]">
      <Icon className="size-5" strokeWidth={1.75} />
    </span>
    <p className="mt-4 text-sm font-medium">{title}</p>
    {description ? <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p> : null}
    {action ? <div className="mt-5">{action}</div> : null}
  </div>
);
