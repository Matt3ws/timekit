import { Plus, X } from "lucide-react";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";
import { Textarea } from "@/ui/textarea";
import { SubscriptionBadge } from "@/components/subscription-badge";
import { PaymentTermsSelect } from "@/components/payment-terms-select";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import type { EditableLine, InvoiceTotals } from "@/lib/billing";
import type { ExtraLineDraft, LineEditDraft } from "@/features/invoices/builder/draft";

interface ReviewStepProps {
  /** The generated lines before edits (for the original text and rate). */
  lines: EditableLine[];
  lineDrafts: Record<string, LineEditDraft>;
  onLineDraftChange: (key: string, draft: LineEditDraft) => void;
  extraDrafts: ExtraLineDraft[];
  onExtraDraftsChange: (drafts: ExtraLineDraft[]) => void;
  invalid: ReadonlySet<string>;
  dueDaysText: string;
  onDueDaysTextChange: (text: string) => void;
  notes: string;
  onNotesChange: (notes: string) => void;
  totals: InvoiceTotals | null;
  currency: string;
}

const formatHours = (hours: number): string => hours.toLocaleString("da-DK", { maximumFractionDigits: 2 });

/** Step 2: adjust line texts and hours, add lines by hand, set terms and a note. */
export const ReviewStep = ({
  lines,
  lineDrafts,
  onLineDraftChange,
  extraDrafts,
  onExtraDraftsChange,
  invalid,
  dueDaysText,
  onDueDaysTextChange,
  notes,
  onNotesChange,
  totals,
  currency,
}: ReviewStepProps): React.JSX.Element => {
  const updateExtra = (index: number, patch: Partial<ExtraLineDraft>): void =>
    onExtraDraftsChange(extraDrafts.map((draft, i) => (i === index ? { ...draft, ...patch } : draft)));

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <div className="label-caps">Lines</div>
        {lines.length === 0 && extraDrafts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No lines yet. Go back to pick work, or add a line.</p>
        ) : null}
        {lines.map((line) => {
          const draft = lineDrafts[line.key] ?? {};
          return (
            <div key={line.key} className="flex items-start gap-2">
              <Textarea
                aria-label="Line text"
                rows={line.description.includes("\n") ? 2 : 1}
                value={draft.description ?? line.description}
                onChange={(event) => onLineDraftChange(line.key, { ...draft, description: event.target.value })}
                className="min-h-9 flex-1 resize-none py-1.5 text-sm"
              />
              {line.subscriptionId ? (
                <div className="flex h-9 min-w-20 shrink-0 items-center justify-end">
                  <SubscriptionBadge />
                </div>
              ) : (
                <div className="w-20 shrink-0">
                  <Input
                    aria-label="Hours"
                    value={draft.quantityText ?? formatHours(line.quantity)}
                    onChange={(event) => onLineDraftChange(line.key, { ...draft, quantityText: event.target.value })}
                    className={cn("text-right font-mono tabular-nums", invalid.has(line.key) && "border-destructive")}
                  />
                </div>
              )}
            </div>
          );
        })}

        {extraDrafts.map((draft, index) => (
          <div key={index} className="flex items-start gap-2">
            <Input
              aria-label="Text for the added line"
              placeholder="e.g. Hosting, October"
              value={draft.description}
              onChange={(event) => updateExtra(index, { description: event.target.value })}
              className={cn("flex-1", invalid.has(`extra:${index}`) && !draft.description.trim() && "border-destructive")}
              autoFocus={index === extraDrafts.length - 1 && draft.description === ""}
            />
            <Input
              aria-label="Quantity"
              value={draft.quantityText}
              onChange={(event) => updateExtra(index, { quantityText: event.target.value })}
              className="w-14 text-right font-mono tabular-nums"
            />
            <Input
              aria-label="Price incl. moms"
              placeholder="Price"
              value={draft.priceText}
              onChange={(event) => updateExtra(index, { priceText: event.target.value })}
              className={cn("w-24 text-right font-mono tabular-nums", invalid.has(`extra:${index}`) && "border-destructive")}
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Remove line"
              className="size-9 shrink-0"
              onClick={() => onExtraDraftsChange(extraDrafts.filter((_, i) => i !== index))}
            >
              <X className="size-4" />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground"
          onClick={() => onExtraDraftsChange([...extraDrafts, { description: "", quantityText: "1", priceText: "" }])}
        >
          <Plus className="size-3.5" />
          Add line
        </Button>
        <p className="text-[11px] text-muted-foreground">Hours and prices include moms, like your rates.</p>
      </section>

      <section className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="invoice-due-days">Payment terms (days)</Label>
          <PaymentTermsSelect id="invoice-due-days" value={dueDaysText} onValueChange={onDueDaysTextChange} />
        </div>
        <div className="col-span-2 space-y-1.5">
          <Label htmlFor="invoice-notes">Note on the invoice</Label>
          <Input
            id="invoice-notes"
            value={notes}
            onChange={(event) => onNotesChange(event.target.value)}
            placeholder="Tak for samarbejdet"
          />
        </div>
      </section>

      {totals ? (
        <section className="space-y-1 rounded-lg bg-muted/50 px-4 py-3 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Subtotal excl. moms</span>
            <span className="font-mono tabular-nums">{formatMoney(totals.subtotal, currency)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>Moms</span>
            <span className="font-mono tabular-nums">{formatMoney(totals.taxAmount, currency)}</span>
          </div>
          <div className="flex justify-between pt-1 text-base font-semibold">
            <span>Total</span>
            <span className="font-mono tabular-nums">{formatMoney(totals.total, currency)}</span>
          </div>
        </section>
      ) : null}
    </div>
  );
};
