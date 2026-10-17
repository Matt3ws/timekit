import type { InvoiceLanguage } from "@/db/schema";

/** A calendar month as stored on subscriptions: "YYYY-MM". */
export type MonthKey = string;

/** The month a timestamp falls in, in local time. */
export const monthKeyOf = (ms: number): MonthKey => {
  const date = new Date(ms);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

const parse = (month: MonthKey): { year: number; monthIndex: number } => {
  const [year, month1] = month.split("-").map(Number);
  return { year: year ?? 1970, monthIndex: (month1 ?? 1) - 1 };
};

/** The month after `month`. */
export const nextMonth = (month: MonthKey): MonthKey => {
  const { year, monthIndex } = parse(month);
  return monthKeyOf(new Date(year, monthIndex + 1, 1).getTime());
};

/** First and last millisecond of a month, local time (the invoice's service period). */
export const monthRange = (month: MonthKey): { start: number; end: number } => {
  const { year, monthIndex } = parse(month);
  return { start: new Date(year, monthIndex, 1).getTime(), end: new Date(year, monthIndex + 1, 1).getTime() - 1 };
};

export interface DueMonthsInput {
  startMonth: MonthKey;
  endMonth: MonthKey | null;
  billedThrough: MonthKey | null;
  now?: number;
}

/**
 * The months that should be invoiced now: every month after the last billed
 * one (or from the start) up to and including the current month, since a
 * month is billed from its 1st. Stops at the end month. Missed months are all
 * returned, so opening the app after a long break catches up.
 */
export const dueMonths = ({ startMonth, endMonth, billedThrough, now = Date.now() }: DueMonthsInput): MonthKey[] => {
  const current = monthKeyOf(now);
  const months: MonthKey[] = [];
  let month = billedThrough ? nextMonth(billedThrough) : startMonth;
  if (month < startMonth) {
    month = startMonth;
  }
  // Guard against a corrupt value looping forever: at most 10 years of catch-up.
  while (month <= current && (!endMonth || month <= endMonth) && months.length < 120) {
    months.push(month);
    month = nextMonth(month);
  }
  return months;
};

/** "October 2026" / "oktober 2026" in the customer's invoice language. */
export const monthLabel = (month: MonthKey, language: InvoiceLanguage): string => {
  const { year, monthIndex } = parse(month);
  return new Date(year, monthIndex, 1).toLocaleDateString(language === "da" ? "da-DK" : "en-GB", {
    month: "long",
    year: "numeric",
  });
};

export interface NextInvoiceInput {
  startMonth: MonthKey;
  endMonth: MonthKey | null;
  billedThrough: MonthKey | null;
}

/**
 * The next month a subscription will invoice, or null when it has ended
 * (every month through its end month is billed). Its invoice is due from the
 * 1st of that month.
 */
export const nextInvoiceMonth = ({ startMonth, endMonth, billedThrough }: NextInvoiceInput): MonthKey | null => {
  const candidate = billedThrough && nextMonth(billedThrough) > startMonth ? nextMonth(billedThrough) : startMonth;
  return endMonth && candidate > endMonth ? null : candidate;
};

export interface SubscriptionLinesInput {
  id: string;
  /** The title, e.g. "Hosting". */
  description: string;
  details: string | null;
  /** Minor units per month. */
  amount: number;
  months: MonthKey[];
  language: InvoiceLanguage;
}

/** One invoice line for one subscription month. */
export interface SubscriptionLine {
  key: string;
  projectId: string;
  taskId: null;
  subscriptionId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

/**
 * One invoice line per month: "Hosting · oktober 2026", with the optional
 * description on the next line (the PDF prints it under the title, like task
 * lines). Keys are "sub:<id>:<month>" so the review step can edit them.
 * Shared by the invoice preview and the issued invoice, so they always match.
 */
export const subscriptionInvoiceLines = ({
  id,
  description,
  details,
  amount,
  months,
  language,
}: SubscriptionLinesInput): SubscriptionLine[] =>
  months.map((month) => ({
    key: `sub:${id}:${month}`,
    projectId: "",
    taskId: null,
    subscriptionId: id,
    description: [`${description} · ${monthLabel(month, language)}`, details?.trim()].filter(Boolean).join("\n"),
    quantity: 1,
    unitPrice: amount,
    amount,
  }));
