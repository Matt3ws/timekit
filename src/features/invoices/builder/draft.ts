import { billableHours, type EditableLine, type ExtraLine, type LineEdit } from "@/lib/billing";
import { inputToMinor, parseDecimal } from "@/lib/money";
import type { BillableProject } from "@/queries/use-invoices";

/**
 * The lines an invoice would get before any edits: one per selected task (its
 * unbilled time rounded up to 15 min) and one per fixed-price project. Mirrors
 * what useCreateInvoice builds from the database, line for line and key for key.
 */
export const draftLinesFromWork = (
  work: BillableProject[],
  selectedTasks: ReadonlySet<string>,
  selectedFixed: ReadonlySet<string>,
): EditableLine[] =>
  work.flatMap((project) => [
    ...project.tasks
      .filter((task) => selectedTasks.has(task.id) && task.trackedSeconds > 0)
      .map((task): EditableLine => {
        const quantity = billableHours(task.trackedSeconds);
        return {
          key: `task:${task.id}`,
          projectId: project.id,
          taskId: task.id,
          description: task.description ? `${task.title}\n${task.description}` : task.title,
          quantity,
          unitPrice: project.rate,
          amount: Math.round(quantity * project.rate),
        };
      }),
    ...(project.billingType === "fixed" && selectedFixed.has(project.id)
      ? [
          {
            key: `fixed:${project.id}`,
            projectId: project.id,
            taskId: null,
            description: project.title,
            quantity: 1,
            unitPrice: project.fixedPrice ?? 0,
            amount: project.fixedPrice ?? 0,
          },
        ]
      : []),
  ]);

/** A generated line's edit as typed in the review step. */
export interface LineEditDraft {
  description?: string;
  quantityText?: string;
}

/** A hand-added line as typed in the review step. */
export interface ExtraLineDraft {
  description: string;
  quantityText: string;
  priceText: string;
}

export interface ParsedEdits {
  edits: Record<string, LineEdit>;
  extras: ExtraLine[];
  /** Keys ("task:…", "extra:0") whose typed numbers don't parse. */
  invalid: Set<string>;
}

/** Turn what was typed into edits the billing helpers understand, collecting invalid fields. */
export const parseEdits = (drafts: Record<string, LineEditDraft>, extraDrafts: ExtraLineDraft[]): ParsedEdits => {
  const invalid = new Set<string>();
  const edits: Record<string, LineEdit> = {};
  for (const [key, draft] of Object.entries(drafts)) {
    const quantity = draft.quantityText === undefined ? undefined : parseDecimal(draft.quantityText, 2);
    if (quantity === null || (quantity !== undefined && quantity < 0)) {
      invalid.add(key);
      continue;
    }
    edits[key] = { description: draft.description, quantity };
  }
  const extras = extraDrafts.map((draft, index): ExtraLine => {
    const quantity = parseDecimal(draft.quantityText || "1", 2);
    const unitPrice = inputToMinor(draft.priceText || "0");
    if (quantity === null || unitPrice === null || !draft.description.trim()) {
      invalid.add(`extra:${index}`);
    }
    return { description: draft.description, quantity: quantity ?? 0, unitPrice: unitPrice ?? 0 };
  });
  return { edits, extras, invalid };
};
