import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  /** Small line under the value, e.g. "14h across 2 customers". */
  hint?: React.ReactNode;
  /** "ember" highlights money waiting to be billed. */
  tone?: "default" | "ember";
  className?: string;
  children?: React.ReactNode;
}

/** One figure with its label: the building block of the dashboard and project headers. */
export const StatCard = ({ label, value, hint, tone = "default", className, children }: StatCardProps): React.JSX.Element => (
  <div
    className={cn(
      "rounded-xl border bg-card px-4 py-3.5",
      tone === "ember" ? "border-ember-line/70 bg-ember-soft/50" : "border-border",
      className,
    )}
  >
    <div className={cn("label-caps", tone === "ember" && "text-ember")}>{label}</div>
    <div className="mt-1.5 font-mono text-[24px] font-semibold leading-none tabular-nums tracking-tight">{value}</div>
    {hint ? <div className="mt-1.5 text-xs text-muted-foreground">{hint}</div> : null}
    {children}
  </div>
);
