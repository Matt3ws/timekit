import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/ui/dialog";
import { Input } from "@/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/ui/select";
import { Switch } from "@/ui/switch";
import { Textarea } from "@/ui/textarea";
import { FormField } from "@/components/form-field";
import { AMOUNT_MESSAGE, parseAmount } from "@/features/forms/fields";
import { customerColor } from "@/lib/customer-color";
import { formatMoney, minorToInput } from "@/lib/money";
import { monthKeyOf, monthLabel } from "@/lib/subscriptions";
import { useCustomers } from "@/queries/use-customers";
import { useSettings } from "@/queries/use-settings";
import { useSaveSubscription, type SubscriptionWithCustomer } from "@/queries/use-subscriptions";

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

const schema = z
  .object({
    customerId: z.string().min(1, "Pick a customer"),
    description: z.string().trim().min(1, "Give it a title, e.g. Hosting"),
    details: z.string(),
    amount: z.string().refine((value) => (parseAmount(value) ?? 0) > 0, AMOUNT_MESSAGE),
    startMonth: z.string().regex(MONTH, "Pick a month"),
    endMonth: z.string().refine((value) => value === "" || MONTH.test(value), "Pick a month or leave empty"),
    active: z.boolean(),
  })
  .refine((values) => values.endMonth === "" || values.endMonth >= values.startMonth, {
    path: ["endMonth"],
    message: "The last month can't be before the first",
  });

type SubscriptionForm = z.infer<typeof schema>;

const emptyForm = (): SubscriptionForm => ({
  customerId: "",
  description: "Hosting",
  details: "",
  amount: "",
  startMonth: monthKeyOf(Date.now()),
  endMonth: "",
  active: true,
});

interface SubscriptionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The subscription to edit; undefined creates a new one. */
  subscription?: SubscriptionWithCustomer;
}

/** Create or edit one monthly subscription. */
export const SubscriptionDialog = ({ open, onOpenChange, subscription }: SubscriptionDialogProps): React.JSX.Element => {
  const { data: settings } = useSettings();
  const { data: customers } = useCustomers();
  const save = useSaveSubscription();
  const currency = settings?.currency ?? "DKK";

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<SubscriptionForm>({ resolver: zodResolver(schema), defaultValues: emptyForm() });

  useEffect(() => {
    if (open) {
      reset(
        subscription
          ? {
              customerId: subscription.customerId,
              description: subscription.description,
              details: subscription.details ?? "",
              amount: minorToInput(subscription.amount),
              startMonth: subscription.startMonth,
              endMonth: subscription.endMonth ?? "",
              active: subscription.active,
            }
          : emptyForm(),
      );
    }
  }, [open, subscription, reset]);

  const onSubmit = handleSubmit((values) => {
    save.mutate(
      {
        id: subscription?.id,
        customerId: values.customerId,
        description: values.description.trim(),
        details: values.details.trim() || null,
        amount: parseAmount(values.amount) ?? 0,
        startMonth: values.startMonth,
        endMonth: values.endMonth || null,
        active: values.active,
      },
      { onSuccess: () => onOpenChange(false) },
    );
  });

  const customer = (customers ?? []).find((c) => c.id === watch("customerId"));
  const previewAmount = parseAmount(watch("amount") ?? "");
  const previewMonth = watch("startMonth") ?? "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{subscription ? "Edit subscription" : "New subscription"}</DialogTitle>
          <DialogDescription>
            A monthly charge. From the 1st, TimeKit reminds you and adds the month to the customer's next invoice.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <FormField id="sub-customer" label="Customer" required error={errors.customerId?.message}>
            {(field) => (
              <Controller
                control={control}
                name="customerId"
                render={({ field: customerField }) => (
                  <Select value={customerField.value} onValueChange={customerField.onChange}>
                    <SelectTrigger id={field.id} aria-invalid={field["aria-invalid"]} className="w-full">
                      <SelectValue placeholder="Select a customer" />
                    </SelectTrigger>
                    <SelectContent>
                      {(customers ?? []).map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          <span className="size-2 rounded-full" style={{ background: customerColor(option.id) }} />
                          {option.companyName ?? option.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            )}
          </FormField>
          <div className="grid grid-cols-3 gap-3">
            <FormField id="sub-description" label="Title" required error={errors.description?.message} className="col-span-2">
              {(field) => <Input {...field} {...register("description")} placeholder="Hosting" />}
            </FormField>
            <FormField id="sub-amount" label={`Per month (${currency})`} required error={errors.amount?.message}>
              {(field) => (
                <Input {...field} {...register("amount")} inputMode="decimal" placeholder="70" className="font-mono tabular-nums" />
              )}
            </FormField>
          </div>
          <FormField id="sub-details" label="Description" hint="Optional. Printed under the title on the invoice.">
            {(field) => (
              <Textarea
                {...field}
                {...register("details")}
                rows={2}
                placeholder="e.g. DigitalOcean server for the Finicc app, incl. updates and monitoring"
              />
            )}
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField id="sub-start" label="First month" required error={errors.startMonth?.message}>
              {(field) => <Input {...field} type="month" {...register("startMonth")} />}
            </FormField>
            <FormField id="sub-end" label="Last month" hint="Leave empty to keep going" error={errors.endMonth?.message}>
              {(field) => <Input {...field} type="month" {...register("endMonth")} />}
            </FormField>
          </div>
          <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5 text-sm">
            <span>
              Active
              <span className="block text-xs text-muted-foreground">Paused subscriptions bill nothing.</span>
            </span>
            <Controller
              control={control}
              name="active"
              render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} />}
            />
          </label>
          <p className="rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            Invoice line:{" "}
            <span className="font-medium text-foreground">
              {watch("description")?.trim() || "Hosting"} ·{" "}
              {MONTH.test(previewMonth) ? monthLabel(previewMonth, customer?.invoiceLanguage ?? "da") : "…"}
            </span>
            {previewAmount ? <span className="font-mono"> · {formatMoney(previewAmount, currency)}</span> : null}
            {watch("details")?.trim() ? (
              <span className="mt-0.5 block whitespace-pre-line">{watch("details")?.trim()}</span>
            ) : null}
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {subscription ? "Save" : "Create subscription"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
