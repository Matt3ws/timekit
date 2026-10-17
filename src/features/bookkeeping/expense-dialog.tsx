import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { AlertTriangle, ExternalLink, Paperclip } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/ui/dialog";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { Textarea } from "@/ui/textarea";
import { DatePicker } from "@/ui/date-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/ui/select";
import { FormField } from "@/components/form-field";
import { DialogActions } from "@/features/forms/dialog-actions";
import { AMOUNT_MESSAGE, amountOrZero, optionalText, parseAmount, requiredText } from "@/features/forms/fields";
import { openReceipt } from "@/features/bookkeeping/receipts";
import { useSaveExpense } from "@/queries/use-bookkeeping";
import { useSettings } from "@/queries/use-settings";
import { minorToInput } from "@/lib/money";
import { EXPENSE_CATEGORY, EXPENSE_CATEGORY_LABELS, type Expense } from "@/db/schema";

/** Deductible moms inside a moms-inclusive price at 25% moms: 25 / 125 = 20%. */
const VAT_SHARE_OF_GROSS = 0.2;

const RECEIPT_EXTENSIONS = ["pdf", "png", "jpg", "jpeg", "heic"];

/** A positive amount; empty or zero is an error. */
const requiredAmount = z
  .string()
  .trim()
  .transform((value, ctx) => {
    const minor = value ? parseAmount(value) : null;
    if (minor === null || minor === 0) {
      ctx.addIssue({ code: "custom", message: value ? AMOUNT_MESSAGE : "Enter what you paid" });
      return z.NEVER;
    }
    return minor;
  });

const expenseSchema = z
  .object({
    date: z
      .number()
      .nullable()
      .transform((value, ctx) => {
        if (value === null) {
          ctx.addIssue({ code: "custom", message: "Pick the date on the receipt" });
          return z.NEVER;
        }
        return value;
      }),
    supplier: requiredText("Enter who you paid"),
    description: requiredText("Describe what you bought"),
    category: z.enum(EXPENSE_CATEGORY),
    amount: requiredAmount,
    vatAmount: amountOrZero,
    note: optionalText,
  })
  .refine((values) => values.vatAmount <= values.amount, {
    path: ["vatAmount"],
    message: "Can't be more than the amount",
  });

type ExpenseFormInput = z.input<typeof expenseSchema>;
type ExpenseFormOutput = z.output<typeof expenseSchema>;

const startOfToday = (): number => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
};

const defaultVat = (amount: number): number => Math.round(amount * VAT_SHARE_OF_GROSS);

const initialValues = (expense: Expense | undefined): ExpenseFormInput => ({
  date: expense?.date ?? startOfToday(),
  supplier: expense?.supplier ?? "",
  description: expense?.description ?? "",
  category: expense?.category ?? "other",
  amount: expense ? minorToInput(expense.amount) : "",
  vatAmount: expense ? minorToInput(expense.vatAmount) : "",
  note: expense?.note ?? "",
});

const fileName = (path: string): string => path.split(/[\\/]/).pop() ?? path;

interface ExpenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The expense to edit; omit to add a new one. */
  expense?: Expense;
}

/**
 * Add or edit an expense: date, supplier, what it was, category, the amount
 * incl. moms, deductible moms (only when moms-registered) and the receipt.
 */
export const ExpenseDialog = ({ open, onOpenChange, expense }: ExpenseDialogProps): React.JSX.Element => {
  const save = useSaveExpense();
  const { data: settings } = useSettings();
  // undefined keeps the stored receipt, null removes it, a path replaces it.
  const [receiptSource, setReceiptSource] = useState<string | null | undefined>(undefined);
  // Until the user types their own moms, it follows the amount (20% of a moms-inclusive price).
  const [vatEdited, setVatEdited] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors },
  } = useForm<ExpenseFormInput, unknown, ExpenseFormOutput>({
    resolver: zodResolver(expenseSchema),
    defaultValues: initialValues(expense),
  });

  useEffect(() => {
    if (open) {
      reset(initialValues(expense));
      setReceiptSource(undefined);
      setVatEdited(expense ? expense.vatAmount !== defaultVat(expense.amount) : false);
    }
  }, [open, expense, reset]);

  // Older expenses with moms stay editable even if moms registration was switched off since.
  const showVat = Boolean(settings?.vatRegistered) || (expense?.vatAmount ?? 0) > 0;
  const receipt = receiptSource === undefined ? (expense?.receiptPath ?? null) : receiptSource;
  const isStoredReceipt = receipt !== null && receiptSource === undefined;

  const pickReceipt = async (): Promise<void> => {
    const picked = await openFileDialog({
      multiple: false,
      filters: [{ name: "Receipt", extensions: RECEIPT_EXTENSIONS }],
    });
    if (picked) {
      setReceiptSource(picked);
    }
  };

  const removeReceipt = (): void => {
    // A new expense has nothing stored, so "no receipt" and "keep" are the same.
    setReceiptSource(expense?.receiptPath ? null : undefined);
  };

  const amountField = register("amount", {
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
      if (!showVat || vatEdited) {
        return;
      }
      const minor = parseAmount(event.target.value);
      setValue("vatAmount", minor === null ? "" : minorToInput(defaultVat(minor)));
    },
  });

  const onSubmit = handleSubmit((values) => {
    save.mutate(
      {
        id: expense?.id,
        ...values,
        vatAmount: showVat ? values.vatAmount : 0,
        receiptSource,
      },
      { onSuccess: () => onOpenChange(false) },
    );
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{expense ? "Edit expense" : "New expense"}</DialogTitle>
          <DialogDescription>Record what you paid and attach the receipt. Keep receipts for 5 years.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <FormField id="expense-date" label="Date" required error={errors.date?.message}>
              {(field) => (
                <Controller
                  control={control}
                  name="date"
                  render={({ field: { value, onChange } }) => (
                    <DatePicker id={field.id} value={value} onChange={onChange} />
                  )}
                />
              )}
            </FormField>
            <FormField id="expense-category" label="Category">
              {(field) => (
                <Controller
                  control={control}
                  name="category"
                  render={({ field: { value, onChange } }) => (
                    <Select value={value} onValueChange={onChange}>
                      <SelectTrigger {...field} className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {EXPENSE_CATEGORY.map((category) => (
                          <SelectItem key={category} value={category}>
                            {EXPENSE_CATEGORY_LABELS[category]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              )}
            </FormField>
          </div>

          <FormField id="expense-supplier" label="Supplier" required error={errors.supplier?.message}>
            {(field) => <Input {...field} {...register("supplier")} autoFocus placeholder="Adobe, DSB, Elgiganten…" />}
          </FormField>
          <FormField id="expense-description" label="Description" required error={errors.description?.message}>
            {(field) => <Input {...field} {...register("description")} placeholder="What you bought" />}
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField
              id="expense-amount"
              label="Amount"
              required
              error={errors.amount?.message}
              hint="Total paid, incl. moms"
            >
              {(field) => (
                <Input
                  {...field}
                  {...amountField}
                  inputMode="decimal"
                  placeholder="0,00"
                  className="font-mono tabular-nums"
                />
              )}
            </FormField>
            {showVat ? (
              <FormField
                id="expense-vat"
                label="Deductible moms"
                error={errors.vatAmount?.message}
                hint="20% of a price with 25% moms"
              >
                {(field) => (
                  <Input
                    {...field}
                    {...register("vatAmount", { onChange: () => setVatEdited(true) })}
                    inputMode="decimal"
                    placeholder="0,00"
                    className="font-mono tabular-nums"
                  />
                )}
              </FormField>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium">Receipt</span>
            {receipt ? (
              <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2">
                <Paperclip className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-sm" title={receipt}>
                  {isStoredReceipt ? "Receipt attached" : fileName(receipt)}
                </span>
                {isStoredReceipt ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => openReceipt(receipt)}>
                    <ExternalLink className="size-3.5" />
                    Open
                  </Button>
                ) : null}
                <Button type="button" variant="ghost" size="sm" onClick={pickReceipt}>
                  Replace
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={removeReceipt}
                >
                  Remove
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Button type="button" variant="outline" onClick={pickReceipt}>
                  <Paperclip className="size-4" />
                  Attach receipt…
                </Button>
                <span className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="size-3.5" aria-hidden />
                  Bookkeeping rules require a receipt for every expense.
                </span>
              </div>
            )}
          </div>

          <FormField id="expense-note" label="Note" error={errors.note?.message}>
            {(field) => <Textarea {...field} {...register("note")} rows={2} placeholder="Optional" />}
          </FormField>

          <DialogActions
            onCancel={() => onOpenChange(false)}
            submitLabel={expense ? "Save" : "Add expense"}
            pending={save.isPending}
          />
        </form>
      </DialogContent>
    </Dialog>
  );
};
