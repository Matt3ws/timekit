import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { customers, subscriptions, type InvoiceLanguage, type Subscription } from "@/db/schema";
import { dueMonths, type MonthKey } from "@/lib/subscriptions";

/** A subscription with its customer, as the lists show it. */
export interface SubscriptionWithCustomer extends Subscription {
  customerName: string;
  invoiceLanguage: InvoiceLanguage;
}

/** A subscription with months waiting to be invoiced. */
export interface DueSubscription extends SubscriptionWithCustomer {
  months: MonthKey[];
}

/** Subscriptions joined with their customer. Distinct result names: the sqlite-proxy maps rows by position. */
export const selectSubscriptionsWithCustomer = () =>
  db
    .select({
      id: subscriptions.id,
      customerId: subscriptions.customerId,
      description: subscriptions.description,
      details: subscriptions.details,
      amount: subscriptions.amount,
      mode: subscriptions.mode,
      startMonth: subscriptions.startMonth,
      endMonth: subscriptions.endMonth,
      billedThrough: subscriptions.billedThrough,
      active: subscriptions.active,
      createdAt: subscriptions.createdAt,
      updatedAt: subscriptions.updatedAt,
      customerName: sql<string>`coalesce(customers.company_name, customers.name)`.as("sub_customer_name"),
      invoiceLanguage: sql<InvoiceLanguage>`customers.invoice_language`.as("sub_invoice_language"),
    })
    .from(subscriptions)
    .innerJoin(customers, eq(customers.id, subscriptions.customerId));

/** Active subscriptions with months to invoice (catching up on missed months). */
export const getDueSubscriptions = async (now: number = Date.now()): Promise<DueSubscription[]> => {
  const rows = await selectSubscriptionsWithCustomer().where(eq(subscriptions.active, true));
  return rows
    .map((row) => ({ ...row, months: dueMonths({ ...row, now }) }))
    .filter((row) => row.months.length > 0);
};
