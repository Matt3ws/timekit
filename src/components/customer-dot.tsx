import { cn } from "@/lib/utils";
import { customerColor } from "@/lib/customer-color";

interface CustomerDotProps {
  customerId: string;
  className?: string;
}

/** The customer's stable colour as a small dot. */
export const CustomerDot = ({ customerId, className }: CustomerDotProps): React.JSX.Element => (
  <span
    className={cn("inline-block size-2 shrink-0 rounded-full", className)}
    style={{ background: customerColor(customerId) }}
    aria-hidden
  />
);

interface CustomerLabelProps {
  customerId: string;
  name: string;
  className?: string;
}

/** A customer name led by its colour dot, truncating when space is tight. */
export const CustomerLabel = ({ customerId, name, className }: CustomerLabelProps): React.JSX.Element => (
  <span className={cn("inline-flex min-w-0 items-center gap-2", className)}>
    <CustomerDot customerId={customerId} />
    <span className="truncate">{name}</span>
  </span>
);
