import { ArrowRight, Repeat } from "lucide-react";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { customerColor } from "@/lib/customer-color";
import { formatMoney } from "@/lib/money";
import { monthLabel } from "@/lib/subscriptions";
import { useDueSubscriptions } from "@/queries/use-subscriptions";

interface SubscriptionsDueProps {
  currency: string;
  /** Opens New invoice for the customer, with its due subscription months preselected. */
  onInvoice: (customerId: string) => void;
}

/** Subscription months waiting to be invoiced. Hidden when nothing is due. */
export const SubscriptionsDue = ({ currency, onInvoice }: SubscriptionsDueProps): React.JSX.Element | null => {
  const { data: due } = useDueSubscriptions();

  if (!due || due.length === 0) {
    return null;
  }

  return (
    <section>
      <div className="mb-2.5 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold tracking-tight">Subscriptions to invoice</h2>
      </div>
      <Card className="gap-0 overflow-hidden py-0">
        <ul className="divide-y divide-border">
          {due.map((subscription) => {
            const months = subscription.months.map((month) => monthLabel(month, "en"));
            return (
              <li key={subscription.id} className="flex items-center gap-3 px-4 py-3">
                <Repeat className="size-4 shrink-0 text-plum" />
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: customerColor(subscription.customerId) }}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {subscription.description} · {subscription.customerName}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {months.length > 2 ? `${months[0]} – ${months[months.length - 1]}` : months.join(", ")}
                  </div>
                </div>
                <span className="font-mono text-sm font-semibold tabular-nums">
                  {formatMoney(subscription.amount * subscription.months.length, currency)}
                </span>
                <Button size="sm" variant="outline" onClick={() => onInvoice(subscription.customerId)} className="gap-1">
                  Create invoice
                  <ArrowRight className="size-3.5" />
                </Button>
              </li>
            );
          })}
        </ul>
      </Card>
    </section>
  );
};
