import type { Project, Settings } from "@/db/schema";

/** The hourly rate actually applied to a project (its override, or the global default). */
export const effectiveHourlyRate = (project: Project, settings: Settings): number =>
  project.hourlyRate ?? settings.defaultHourlyRate;

/**
 * The moms rate new invoices carry: the default rate when moms-registered,
 * 0 when not (a "personlig mindre virksomhed" may not charge moms).
 */
export const effectiveTaxRate = (settings: Pick<Settings, "vatRegistered" | "defaultTaxRate">): number =>
  settings.vatRegistered ? settings.defaultTaxRate : 0;

/**
 * When a "personlig mindre virksomhed" must renew its registration on
 * virk.dk: the next 3-year anniversary of its registration that hasn't passed.
 */
export const nextRegistrationRenewal = (registeredAt: number, now: number = Date.now()): number => {
  const renewal = new Date(registeredAt);
  do {
    renewal.setFullYear(renewal.getFullYear() + 3);
  } while (renewal.getTime() < now - 24 * 60 * 60 * 1000);
  return renewal.getTime();
};

/** The currency actually applied to a project (its override, or the global default). */
export const effectiveCurrency = (project: Project, settings: Settings): string =>
  project.currency ?? settings.currency;

/** Billable hours, rounded UP to the nearest quarter hour (15 min). 1h 4m -> 1.25h. */
export const billableHours = (trackedSeconds: number): number =>
  Math.ceil(trackedSeconds / 900) / 4;

/**
 * What unbilled hourly work is worth: each task is rounded up to the quarter
 * hour on its own, exactly as invoices bill it (one line per task). Rounding
 * the project total once would under-count: 4 tasks × 1 min is 1h, not 0.25h.
 */
export const unbilledAmount = (unbilledSecondsPerTask: number[], rate: number): number =>
  unbilledSecondsPerTask.reduce((sum, seconds) => sum + Math.round(billableHours(seconds) * rate), 0);

/**
 * Invoice numbers run in one series per customer: the global prefix, the
 * customer's series code and that customer's own sequence, e.g. "Cc-FIN-00001".
 * The code keeps numbers unique across customers (Danish rules allow several
 * series, but every number must be unique).
 */
export const formatInvoiceNumber = (prefix: string, customerCode: string, sequence: number): string =>
  `${prefix}${customerCode}-${String(sequence).padStart(5, "0")}`;

const LEGAL_SUFFIXES = /\b(aps|a\/s|as|ivs|i\/s|is|k\/s|p\/s|ab|gmbh|ltd|inc|llc)\b\.?/gi;

/**
 * Suggest a 3-letter series code from a customer's name, e.g. "Finicc ApS" →
 * "FIN", "Kandii Emballage" → "KAN". Danish letters are spelled out (Ø → O)
 * and a digit is appended while the code is taken.
 */
export const suggestInvoiceCode = (name: string, taken: string[]): string => {
  const letters = name
    .replace(LEGAL_SUFFIXES, "")
    .replace(/æ/gi, "AE")
    .replace(/ø/gi, "O")
    .replace(/å/gi, "AA")
    .normalize("NFD")
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase();
  const base = (letters || "CUS").slice(0, 3).padEnd(3, "X");
  const used = new Set(taken.map((code) => code.toUpperCase()));
  if (!used.has(base)) {
    return base;
  }
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base}${suffix}`;
    if (!used.has(candidate)) {
      return candidate;
    }
  }
};

export interface DraftLineItem {
  projectId: string;
  /** Hourly lines: the task billed. */
  taskId?: string | null;
  /** Subscription lines: the subscription billed. */
  subscriptionId?: string | null;
  /** Task title and (optionally) its own description, separated by a newline. */
  description: string;
  /** Whole hours for hourly lines, or 1 for fixed-price lines. */
  quantity: number;
  /** Minor units. */
  unitPrice: number;
  /** Minor units. */
  amount: number;
}

export interface ProjectBillingInput {
  project: Project;
  settings: Settings;
  /** Total tracked seconds across the project's tasks. */
  trackedSeconds: number;
}

/** Build the invoice line item for a single project (hourly vs fixed). */
export const lineItemForProject = ({
  project,
  settings,
  trackedSeconds,
}: ProjectBillingInput): DraftLineItem => {
  if (project.billingType === "fixed") {
    const amount = project.fixedPrice ?? 0;
    return {
      projectId: project.id,
      description: project.title,
      quantity: 1,
      unitPrice: amount,
      amount,
    };
  }

  // Hourly work is billed in quarter-hour increments, always rounded UP (1h 4m -> 1.25h).
  const hours = billableHours(trackedSeconds);
  const rate = effectiveHourlyRate(project, settings);
  return {
    projectId: project.id,
    description: project.title,
    quantity: hours,
    unitPrice: rate,
    amount: Math.round(hours * rate),
  };
};

export interface TaskBillingInput {
  project: Project;
  settings: Settings;
  task: { id: string; title: string; description: string | null; trackedSeconds: number };
}

/**
 * Build an hourly line item for a single task (quarter-hour rounding). The description
 * holds only the task's own title + description — time entries are stored separately.
 */
export const lineItemForTask = ({ project, settings, task }: TaskBillingInput): DraftLineItem => {
  const hours = billableHours(task.trackedSeconds);
  const rate = effectiveHourlyRate(project, settings);
  const description = task.description ? `${task.title}\n${task.description}` : task.title;
  return {
    projectId: project.id,
    taskId: task.id,
    description,
    quantity: hours,
    unitPrice: rate,
    amount: Math.round(hours * rate),
  };
};

export interface InvoiceTotals {
  subtotal: number;
  taxAmount: number;
  total: number;
}

/** The net (excl. moms) part of a moms-inclusive amount, in minor units. */
export const netAmount = (grossMinor: number, taxRateBp: number): number =>
  Math.round((grossMinor * 10000) / (10000 + taxRateBp));

/**
 * Sum line items and break out moms. Prices are **moms-inclusive**: a rate of
 * 600 already contains 25% moms, so the customer pays 600 and the moms (120) is
 * extracted, leaving a net of 480. All values in minor units.
 *
 * The net subtotal is the sum of each line's net amount, so the per-line nets
 * printed on the invoice always add up to the subtotal exactly.
 *
 * - `total`    = sum of line amounts (gross, what the customer pays)
 * - `subtotal` = net amount, excluding moms
 * - `taxAmount`= moms contained within the total
 */
export const computeTotals = (lineItems: Pick<DraftLineItem, "amount">[], taxRateBp: number): InvoiceTotals => {
  const total = lineItems.reduce((sum, item) => sum + item.amount, 0);
  const subtotal = lineItems.reduce((sum, item) => sum + netAmount(item.amount, taxRateBp), 0);
  return { subtotal, taxAmount: total - subtotal, total };
};

/** A line as the invoice builder shows and edits it, identified by a stable key. */
export interface EditableLine extends DraftLineItem {
  /** "task:<id>", "fixed:<projectId>" or "extra:<n>". */
  key: string;
}

/** What the user changed on a generated line in the review step. */
export interface LineEdit {
  description?: string;
  /** Hours (hourly lines) or quantity; the amount is recomputed from it. */
  quantity?: number;
}

/** A line the user added by hand, e.g. a monthly hosting fee. Unit price incl. moms. */
export interface ExtraLine {
  description: string;
  quantity: number;
  unitPrice: number;
}

/**
 * Apply review-step edits to the generated lines and append hand-added lines.
 * Used for the live preview AND when issuing, so they can never disagree.
 * Lines whose amount ends up 0 with no description are dropped.
 */
export const applyLineEdits = (
  lines: EditableLine[],
  edits: Record<string, LineEdit>,
  extras: ExtraLine[],
): EditableLine[] => [
  ...lines.map((line) => {
    const edit = edits[line.key];
    if (!edit) {
      return line;
    }
    const quantity = edit.quantity ?? line.quantity;
    return {
      ...line,
      description: edit.description?.trim() ? edit.description : line.description,
      quantity,
      amount: Math.round(quantity * line.unitPrice),
    };
  }),
  ...extras
    .filter((extra) => extra.description.trim() !== "" || extra.quantity * extra.unitPrice !== 0)
    .map((extra, index) => ({
      key: `extra:${index}`,
      projectId: "",
      taskId: null,
      description: extra.description.trim(),
      quantity: extra.quantity,
      unitPrice: extra.unitPrice,
      amount: Math.round(extra.quantity * extra.unitPrice),
    })),
];

/** The seller's details, frozen onto an invoice when it is issued. */
export interface SellerSnapshot {
  companyName: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  city: string | null;
  country: string | null;
  vatNumber: string | null;
  email: string | null;
  phone: string | null;
  bankName: string | null;
  bankAccount: string | null;
  iban: string | null;
  swift: string | null;
}

/** Take the seller fields out of the settings row. */
export const sellerFromSettings = (settings: Settings): SellerSnapshot => ({
  companyName: settings.companyName,
  addressLine1: settings.addressLine1,
  addressLine2: settings.addressLine2,
  postalCode: settings.postalCode,
  city: settings.city,
  country: settings.country,
  vatNumber: settings.vatNumber,
  email: settings.email,
  phone: settings.phone,
  bankName: settings.bankName,
  bankAccount: settings.bankAccount,
  iban: settings.iban,
  swift: settings.swift,
});

/** The seller shown on an invoice: its snapshot, or today's settings for invoices issued before snapshots existed. */
export const sellerForInvoice = (sellerJson: string | null, settings: Settings): SellerSnapshot => {
  if (sellerJson) {
    try {
      return { ...sellerFromSettings(settings), ...(JSON.parse(sellerJson) as Partial<SellerSnapshot>) };
    } catch {
      // Fall through to the current settings.
    }
  }
  return sellerFromSettings(settings);
};
