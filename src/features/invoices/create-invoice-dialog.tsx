import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/ui/dialog";
import { SelectStep } from "@/features/invoices/builder/select-step";
import { ReviewStep } from "@/features/invoices/builder/review-step";
import { InvoicePreview } from "@/features/invoices/builder/invoice-preview";
import {
  draftLinesFromWork,
  parseEdits,
  type ExtraLineDraft,
  type LineEditDraft,
} from "@/features/invoices/builder/draft";
import { useInvoicePdf } from "@/features/invoices/use-invoice-pdf";
import type { InvoiceDocumentProps } from "@/features/invoices/invoice-document";
import {
  useCreateInvoice,
  useInvoiceableWork,
  useInvoicePreviewExtras,
  type BillableProject,
} from "@/queries/use-invoices";
import { useCustomers } from "@/queries/use-customers";
import { useDueSubscriptions } from "@/queries/use-subscriptions";
import { subscriptionInvoiceLines } from "@/lib/subscriptions";
import { useSettings } from "@/queries/use-settings";
import {
  applyLineEdits,
  computeTotals,
  effectiveTaxRate,
  formatInvoiceNumber,
  sellerFromSettings,
  suggestInvoiceCode,
} from "@/lib/billing";
import { formatMoney } from "@/lib/money";

interface CreateInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  presetCustomerId?: string;
  presetProjectIds?: string[];
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * New invoice in two steps: pick unbilled work, then review it next to a live
 * PDF preview (edit line texts and hours, add lines such as a hosting fee, set
 * terms and a note) and issue it. Issuing assigns the customer's next number.
 */
export const CreateInvoiceDialog = ({
  open,
  onOpenChange,
  presetCustomerId,
  presetProjectIds,
}: CreateInvoiceDialogProps): React.JSX.Element => {
  const { data: customers } = useCustomers();
  const { data: settings } = useSettings();
  const create = useCreateInvoice();
  const pdf = useInvoicePdf();

  const [step, setStep] = useState<"select" | "review">("select");
  const [customerId, setCustomerId] = useState("");
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());
  const [selectedFixed, setSelectedFixed] = useState<Set<string>>(new Set());
  const [selectedSubscriptions, setSelectedSubscriptions] = useState<Set<string>>(new Set());
  const [includeEntries, setIncludeEntries] = useState(false);
  const [lineDrafts, setLineDrafts] = useState<Record<string, LineEditDraft>>({});
  const [extraDrafts, setExtraDrafts] = useState<ExtraLineDraft[]>([]);
  const [dueDaysText, setDueDaysText] = useState("14");
  const [notes, setNotes] = useState("");
  const presetApplied = useRef(false);

  const { data: work } = useInvoiceableWork(customerId || undefined);
  const { data: allDue } = useDueSubscriptions();
  const dueSubscriptions = useMemo(
    () => (allDue ?? []).filter((subscription) => subscription.customerId === customerId),
    [allDue, customerId],
  );
  const dueKey = dueSubscriptions.map((subscription) => subscription.id).join(",");

  // Due subscription months are preselected whenever the customer changes.
  useEffect(() => {
    setSelectedSubscriptions(new Set(dueKey ? dueKey.split(",") : []));
  }, [customerId, dueKey]);

  // Fresh state every time the dialog opens.
  useEffect(() => {
    if (open) {
      setStep("select");
      setCustomerId(presetCustomerId ?? "");
      setSelectedTasks(new Set());
      setSelectedFixed(new Set());
      setIncludeEntries(false);
      setLineDrafts({});
      setExtraDrafts([]);
      setDueDaysText("14");
      setNotes("");
      presetApplied.current = false;
    }
  }, [open, presetCustomerId]);

  // Once the customer's work loads, preselect everything billable (in the preset projects, if given).
  useEffect(() => {
    if (!open || presetApplied.current || !work || !customerId) {
      return;
    }
    const preset = presetProjectIds?.length ? new Set(presetProjectIds) : null;
    const tasks = new Set<string>();
    const fixed = new Set<string>();
    for (const project of work) {
      if (preset && !preset.has(project.id)) {
        continue;
      }
      if (project.billingType === "fixed") {
        if (!project.alreadyBilled && preset) {
          fixed.add(project.id);
        }
      } else {
        project.tasks.filter((task) => task.trackedSeconds > 0).forEach((task) => tasks.add(task.id));
      }
    }
    setSelectedTasks(tasks);
    setSelectedFixed(fixed);
    presetApplied.current = true;
  }, [open, work, customerId, presetProjectIds]);

  const toggle = (setter: typeof setSelectedTasks) => (id: string) =>
    setter((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  const toggleProject = (project: BillableProject, selected: boolean): void =>
    setSelectedTasks((previous) => {
      const next = new Set(previous);
      for (const task of project.tasks.filter((t) => t.trackedSeconds > 0)) {
        if (selected) {
          next.add(task.id);
        } else {
          next.delete(task.id);
        }
      }
      return next;
    });

  const customer = customers?.find((c) => c.id === customerId);
  const customerTerms = customer?.paymentTermsDays;

  // Payment terms start from the customer's own (editable per invoice in the review step).
  useEffect(() => {
    if (open && customerTerms !== undefined) {
      setDueDaysText(String(customerTerms));
    }
    // Runs after the reset effect above, so reopening for the same customer also gets their terms.
  }, [open, customerId, customerTerms]);
  // Same order as issueInvoice: work first, then subscription months.
  const generated = useMemo(
    () => [
      ...draftLinesFromWork(work ?? [], selectedTasks, selectedFixed),
      ...dueSubscriptions
        .filter((subscription) => selectedSubscriptions.has(subscription.id))
        .flatMap((subscription) =>
          subscriptionInvoiceLines({ ...subscription, language: subscription.invoiceLanguage }),
        ),
    ],
    [work, selectedTasks, selectedFixed, dueSubscriptions, selectedSubscriptions],
  );
  const parsed = useMemo(() => parseEdits(lineDrafts, extraDrafts), [lineDrafts, extraDrafts]);
  const dueDays = Number(dueDaysText);
  const invalid = useMemo(() => {
    const keys = new Set(parsed.invalid);
    if (!Number.isInteger(dueDays) || dueDays < 0 || dueDays > 365) {
      keys.add("dueDays");
    }
    return keys;
  }, [parsed.invalid, dueDays]);
  const finalLines = useMemo(
    () => applyLineEdits(generated, parsed.edits, parsed.extras.filter((_, index) => !invalid.has(`extra:${index}`))),
    [generated, parsed, invalid],
  );

  const currencies = new Set(
    (work ?? [])
      .filter(
        (project) => project.tasks.some((task) => selectedTasks.has(task.id)) || selectedFixed.has(project.id),
      )
      .map((project) => project.currency)
      // Subscriptions are priced in the default currency.
      .concat(dueSubscriptions.some((s) => selectedSubscriptions.has(s.id)) ? [settings?.currency ?? "DKK"] : []),
  );
  const mixedCurrency = currencies.size > 1;
  const currency = [...currencies][0] ?? settings?.currency ?? "DKK";
  const totals = settings && finalLines.length > 0 ? computeTotals(finalLines, effectiveTaxRate(settings)) : null;

  const invoiceNumber =
    customer && settings
      ? formatInvoiceNumber(
          settings.invoiceNumberPrefix,
          customer.invoiceCode ??
            suggestInvoiceCode(
              customer.companyName ?? customer.name,
              (customers ?? []).map((c) => c.invoiceCode ?? "").filter(Boolean),
            ),
          customer.invoiceNumberNext,
        )
      : "";

  const previewTaskIds = useMemo(
    () => finalLines.flatMap((line) => (line.taskId ? [line.taskId] : [])),
    [finalLines],
  );
  const { data: previewExtras } = useInvoicePreviewExtras({
    taskIds: previewTaskIds,
    includeEntries,
    enabled: step === "review",
  });

  // The draft as a full document for the live preview, with the same breakdown and links the issued PDF gets.
  const previewDocument = useMemo((): InvoiceDocumentProps | null => {
    if (step !== "review" || !customer || !settings || !totals) {
      return null;
    }
    const now = Date.now();
    const projectTitle = new Map((work ?? []).map((project) => [project.id, project.title]));
    return {
      invoice: {
        id: "preview",
        invoiceNumber,
        customerId: customer.id,
        status: "sent",
        issueDate: now,
        dueDate: now + (invalid.has("dueDays") ? 14 : dueDays) * DAY,
        currency,
        subtotal: totals.subtotal,
        taxRate: effectiveTaxRate(settings),
        taxAmount: totals.taxAmount,
        total: totals.total,
        notes: notes.trim() || null,
        pdfPath: null,
        paidAt: null,
        kind: "invoice",
        sellerJson: JSON.stringify(sellerFromSettings(settings)),
        periodStart: null,
        periodEnd: null,
        creditedInvoiceId: null,
        createdAt: now,
        updatedAt: now,
      },
      customer,
      lineItems: finalLines.map((line) => ({
        id: line.key,
        invoiceId: "preview",
        projectId: line.projectId || null,
        taskId: line.taskId ?? null,
        subscriptionId: line.subscriptionId ?? null,
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        amount: line.amount,
        entriesJson: null,
        projectTitle: line.projectId ? (projectTitle.get(line.projectId) ?? null) : null,
        entries: line.taskId ? (previewExtras?.entriesByTask[line.taskId] ?? []) : [],
      })),
      taskLinks: previewExtras?.taskLinks ?? [],
      settings,
    };
  }, [step, customer, settings, totals, work, invoiceNumber, invalid, dueDays, currency, notes, finalLines, previewExtras]);

  const canReview = Boolean(customerId) && !mixedCurrency;
  const canIssue = finalLines.length > 0 && invalid.size === 0 && !mixedCurrency && !create.isPending;

  const onIssue = async (): Promise<void> => {
    if (!canIssue || !customerId) {
      return;
    }
    try {
      const invoice = await create.mutateAsync({
        customerId,
        taskIds: generated.flatMap((line) => (line.key.startsWith("task:") && line.taskId ? [line.taskId] : [])),
        fixedProjectIds: generated.flatMap((line) => (line.key.startsWith("fixed:") ? [line.projectId] : [])),
        subscriptionIds: [...selectedSubscriptions].filter((id) => dueKey.split(",").includes(id)),
        includeTimeEntries: includeEntries,
        edits: parsed.edits,
        extras: parsed.extras,
        dueDays,
        notes,
      });
      onOpenChange(false);
      await pdf.open(invoice.id);
    } catch {
      // useCreateInvoice shows its own error toast.
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        // The review step is the one exception to the shared modal width: it shows the real PDF side by side.
        className={step === "review" ? "flex h-[88vh] flex-col overflow-visible sm:max-w-6xl" : undefined}
      >
        <DialogHeader>
          <div className="label-caps">
            New invoice{customer ? ` · ${customer.companyName ?? customer.name}` : ""} · step {step === "select" ? 1 : 2}{" "}
            of 2
          </div>
          <DialogTitle>{step === "select" ? "What are you billing?" : "Review before issuing"}</DialogTitle>
          <DialogDescription>
            {step === "select"
              ? "Unbilled time is rounded up to 15 minutes per task."
              : "Nothing gets a number until you issue it. The preview is the real PDF."}
          </DialogDescription>
        </DialogHeader>

        {step === "select" ? (
          <>
            <SelectStep
              customers={customers ?? []}
              customerId={customerId}
              currency={settings?.currency ?? "DKK"}
              onCustomerChange={(id) => {
                setCustomerId(id);
                setSelectedTasks(new Set());
                setSelectedFixed(new Set());
                presetApplied.current = false;
              }}
              work={work}
              selectedTasks={selectedTasks}
              selectedFixed={selectedFixed}
              dueSubscriptions={dueSubscriptions}
              selectedSubscriptions={selectedSubscriptions}
              onToggleSubscription={toggle(setSelectedSubscriptions)}
              onToggleTask={toggle(setSelectedTasks)}
              onToggleFixed={toggle(setSelectedFixed)}
              onToggleProject={toggleProject}
              includeEntries={includeEntries}
              onIncludeEntriesChange={setIncludeEntries}
            />
            {mixedCurrency ? (
              <p className="text-sm text-destructive">The selected work uses different currencies. Invoice them separately.</p>
            ) : null}
            <div className="flex items-center justify-between border-t border-border pt-4">
              <span className="font-mono text-sm tabular-nums text-muted-foreground">
                {totals ? formatMoney(totals.total, currency) : ""}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button onClick={() => setStep("review")} disabled={!canReview} className="gap-1.5">
                  Review
                  <ArrowRight className="size-4" />
                </Button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="grid min-h-0 flex-1 grid-cols-5 gap-5">
              <div className="col-span-2 min-h-0 overflow-y-auto pr-1">
                <ReviewStep
                  lines={generated}
                  lineDrafts={lineDrafts}
                  onLineDraftChange={(key, draft) => setLineDrafts((previous) => ({ ...previous, [key]: draft }))}
                  extraDrafts={extraDrafts}
                  onExtraDraftsChange={setExtraDrafts}
                  invalid={invalid}
                  dueDaysText={dueDaysText}
                  onDueDaysTextChange={setDueDaysText}
                  notes={notes}
                  onNotesChange={setNotes}
                  totals={totals}
                  currency={currency}
                />
              </div>
              <div className="col-span-3 min-h-0">
                <InvoicePreview document={previewDocument} />
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-border pt-4">
              <Button variant="ghost" onClick={() => setStep("select")} className="gap-1.5">
                <ArrowLeft className="size-4" />
                Back
              </Button>
              <Button
                onClick={onIssue}
                disabled={!canIssue}
                className="gap-1.5 bg-ember text-ember-foreground hover:bg-ember/90"
              >
                {create.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                Issue {invoiceNumber}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
