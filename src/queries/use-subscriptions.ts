import { useMutation, useQuery, type UseMutationResult, type UseQueryResult } from "@tanstack/react-query";
import { asc, eq } from "drizzle-orm";
import { toast } from "sonner";
import { db } from "@/db/client";
import { subscriptions } from "@/db/schema";
import { newId } from "@/lib/ids";
import { monthLabel, type MonthKey } from "@/lib/subscriptions";
import { queryClient as sharedQueryClient } from "@/lib/query-client";
import {
  getDueSubscriptions,
  selectSubscriptionsWithCustomer,
  type DueSubscription,
  type SubscriptionWithCustomer,
} from "@/queries/subscription-due";

export type { DueSubscription, SubscriptionWithCustomer } from "@/queries/subscription-due";

const subscriptionsKey = ["subscriptions"] as const;

/** A customer's subscriptions, or every subscription when no customer is given. */
export const useSubscriptions = (customerId?: string): UseQueryResult<SubscriptionWithCustomer[], Error> =>
  useQuery({
    queryKey: [...subscriptionsKey, customerId ?? "all"],
    queryFn: () =>
      (customerId
        ? selectSubscriptionsWithCustomer().where(eq(subscriptions.customerId, customerId))
        : selectSubscriptionsWithCustomer()
      ).orderBy(asc(subscriptions.createdAt)),
  });

/** Subscription months waiting to be invoiced, across customers. */
export const useDueSubscriptions = (): UseQueryResult<DueSubscription[], Error> =>
  useQuery({
    queryKey: [...subscriptionsKey, "due"],
    queryFn: () => getDueSubscriptions(),
  });

export interface SubscriptionInput {
  id?: string;
  customerId: string;
  /** The title, e.g. "Hosting". */
  description: string;
  /** Optional longer text under the title on the invoice. */
  details: string | null;
  /** Minor units per month. */
  amount: number;
  startMonth: MonthKey;
  endMonth: MonthKey | null;
  active: boolean;
}

/** Subscription lists and due months; issuing an invoice changes them too. */
export const refreshSubscriptions = (): Promise<void> =>
  sharedQueryClient.invalidateQueries({ queryKey: subscriptionsKey, refetchType: "all" });

export const useSaveSubscription = (): UseMutationResult<void, Error, SubscriptionInput> =>
  useMutation({
    mutationFn: async ({ id, ...values }): Promise<void> => {
      const now = Date.now();
      if (id) {
        await db.update(subscriptions).set({ ...values, updatedAt: now }).where(eq(subscriptions.id, id));
        return;
      }
      await db.insert(subscriptions).values({ ...values, id: newId(), createdAt: now, updatedAt: now });
    },
    onSuccess: async (): Promise<void> => {
      await refreshSubscriptions();
      toast.success("Subscription saved");
    },
    onError: (error: Error): void => {
      toast.error(`Couldn't save the subscription: ${error.message}`);
    },
  });

export const useDeleteSubscription = (): UseMutationResult<void, Error, { id: string }> =>
  useMutation({
    mutationFn: async ({ id }): Promise<void> => {
      // Invoices already issued stay; only the recurring charge goes.
      await db.delete(subscriptions).where(eq(subscriptions.id, id));
    },
    onSuccess: async (): Promise<void> => {
      await refreshSubscriptions();
      toast.success("Subscription deleted");
    },
    onError: (): void => {
      toast.error("Couldn't delete the subscription");
    },
  });

let reminded = false;

/**
 * Once per app start: remind that subscription months are due, with a button
 * to create the invoice. Nothing is issued automatically; the months appear,
 * preselected, in New invoice for that customer.
 */
export const remindDueSubscriptions = async (openInvoiceFor: (customerId: string) => void): Promise<void> => {
  if (reminded) {
    return;
  }
  reminded = true;
  const due = await getDueSubscriptions().catch(() => []);
  if (due.length === 0) {
    return;
  }
  const customerIds = [...new Set(due.map((row) => row.customerId))];
  const summary = due
    .map((row) => {
      const months = row.months.map((month) => monthLabel(month, "en"));
      const range = months.length > 2 ? `${months[0]} – ${months[months.length - 1]}` : months.join(", ");
      return `${row.description} for ${row.customerName}: ${range}`;
    })
    .join(" · ");
  const onlyCustomer = customerIds.length === 1 ? customerIds[0] : undefined;
  toast(`${due.length === 1 ? "A subscription is" : `${due.length} subscriptions are`} ready to invoice`, {
    description: summary,
    duration: Number.POSITIVE_INFINITY,
    closeButton: true,
    action: onlyCustomer ? { label: "Create invoice", onClick: () => openInvoiceFor(onlyCustomer) } : undefined,
  });
};
