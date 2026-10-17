import { Repeat } from "lucide-react";
import { cn } from "@/lib/utils";

/** Marks a subscription charge (or an invoice holding one) wherever it shows up. */
export const SubscriptionBadge = ({ className }: { className?: string }): React.JSX.Element => (
  <span
    className={cn(
      "inline-flex shrink-0 items-center gap-1 rounded bg-info-soft px-1.5 text-[10.5px] font-medium text-info",
      className,
    )}
  >
    <Repeat className="size-3" />
    Subscription
  </span>
);
