import { useEffect, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/ui/dialog";
import { Input } from "@/ui/input";
import { Textarea } from "@/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/ui/select";
import { FormField, FormSection } from "@/components/form-field";
import { PaymentTermsSelect } from "@/components/payment-terms-select";
import { DialogActions } from "@/features/forms/dialog-actions";
import { optionalEmail, optionalText, requiredText } from "@/features/forms/fields";
import { useCreateCustomer, useUpdateCustomer } from "@/queries/use-customers";
import { useSettings } from "@/queries/use-settings";
import { formatInvoiceNumber } from "@/lib/billing";
import { INVOICE_LANGUAGE, type Customer, type InvoiceLanguage } from "@/db/schema";

const LANGUAGE_LABELS: Record<InvoiceLanguage, string> = {
  da: "Danish",
  en: "English",
};

/** Shown in the preview until the customer has a code of their own. */
const PLACEHOLDER_CODE = "FIN";

interface CustomerSchemaOptions {
  /** The series only moves forward: the next number can't go below this. */
  minimumNext: number;
}

const customerSchema = ({ minimumNext }: CustomerSchemaOptions) =>
  z.object({
    name: requiredText("Enter the contact's name"),
    companyName: optionalText,
    email: optionalEmail,
    phone: optionalText,
    addressLine1: optionalText,
    addressLine2: optionalText,
    postalCode: optionalText,
    city: optionalText,
    country: optionalText,
    vatNumber: optionalText,
    notes: optionalText,
    invoiceCode: z
      .string()
      .trim()
      .transform((value) => value.toUpperCase())
      .refine((value) => !value || /^[A-Z0-9]{1,10}$/.test(value), "Letters and digits only, up to 10")
      .transform((value) => value || null),
    invoiceNumberNext: z
      .string()
      .trim()
      .refine(
        (value) => /^\d+$/.test(value) && Number(value) >= minimumNext,
        `Must be a whole number of at least ${minimumNext}`,
      )
      .transform(Number),
    invoiceLanguage: z.enum(INVOICE_LANGUAGE),
    paymentTermsDays: z
      .string()
      .trim()
      .refine((value) => /^\d+$/.test(value) && Number(value) <= 365, "Whole days, 0 to 365")
      .transform(Number),
  });

type CustomerSchema = ReturnType<typeof customerSchema>;
type CustomerFormInput = z.input<CustomerSchema>;
type CustomerFormOutput = z.output<CustomerSchema>;

const initialValues = (customer: Customer | undefined): CustomerFormInput => ({
  name: customer?.name ?? "",
  companyName: customer?.companyName ?? "",
  email: customer?.email ?? "",
  phone: customer?.phone ?? "",
  addressLine1: customer?.addressLine1 ?? "",
  addressLine2: customer?.addressLine2 ?? "",
  postalCode: customer?.postalCode ?? "",
  city: customer?.city ?? "",
  country: customer?.country ?? "",
  vatNumber: customer?.vatNumber ?? "",
  notes: customer?.notes ?? "",
  invoiceCode: customer?.invoiceCode ?? "",
  invoiceNumberNext: String(customer?.invoiceNumberNext ?? 1),
  invoiceLanguage: customer?.invoiceLanguage ?? "da",
  paymentTermsDays: String(customer?.paymentTermsDays ?? 14),
});

const isDuplicateCodeError = (error: Error): boolean =>
  String(error).includes("customers_invoice_code_unique") || String(error).includes("customers.invoice_code");

interface CustomerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer?: Customer;
}

/** Create or edit a customer: contact, address and their invoice number series. */
export const CustomerDialog = ({
  open,
  onOpenChange,
  customer,
}: CustomerDialogProps): React.JSX.Element => {
  const create = useCreateCustomer();
  const update = useUpdateCustomer();
  const { data: settings } = useSettings();
  const minimumNext = customer?.invoiceNumberNext ?? 1;
  const schema = useMemo(() => customerSchema({ minimumNext }), [minimumNext]);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    watch,
    control,
    formState: { errors },
  } = useForm<CustomerFormInput, unknown, CustomerFormOutput>({
    resolver: zodResolver(schema),
    defaultValues: initialValues(customer),
  });

  useEffect(() => {
    if (open) {
      reset(initialValues(customer));
    }
  }, [open, customer, reset]);

  const onSubmit = handleSubmit((values) => {
    const options = {
      onSuccess: () => onOpenChange(false),
      onError: (error: Error) => {
        if (isDuplicateCodeError(error)) {
          setError("invoiceCode", { message: "Already used by another customer" });
        }
      },
    };
    if (customer) {
      update.mutate({ id: customer.id, ...values }, options);
    } else {
      create.mutate(values, options);
    }
  });

  const typedCode = watch("invoiceCode").trim().toUpperCase();
  const previewCode = typedCode || customer?.invoiceCode || PLACEHOLDER_CODE;
  const typedNext = Number(watch("invoiceNumberNext"));
  const previewNext = Number.isInteger(typedNext) && typedNext >= minimumNext ? typedNext : minimumNext;
  const hasCode = Boolean(typedCode || customer?.invoiceCode);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{customer ? "Edit customer" : "New customer"}</DialogTitle>
          <DialogDescription>Contact and address details appear on the invoices you send them.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <FormField id="customer-name" label="Contact name" required error={errors.name?.message}>
              {(field) => <Input {...field} {...register("name")} autoFocus placeholder="Jane Jensen" />}
            </FormField>
            <FormField id="customer-company" label="Company" error={errors.companyName?.message}>
              {(field) => <Input {...field} {...register("companyName")} placeholder="Acme ApS" />}
            </FormField>
            <FormField id="customer-email" label="Email" error={errors.email?.message}>
              {(field) => (
                <Input {...field} {...register("email")} type="email" placeholder="jane@acme.dk" autoComplete="off" />
              )}
            </FormField>
            <FormField id="customer-phone" label="Phone" error={errors.phone?.message}>
              {(field) => <Input {...field} {...register("phone")} type="tel" />}
            </FormField>
          </div>

          <FormSection title="Address">
            <div className="flex flex-col gap-2">
              <FormField id="customer-address1" label="Street address" error={errors.addressLine1?.message}>
                {(field) => <Input {...field} {...register("addressLine1")} placeholder="Address line 1" />}
              </FormField>
              <Input
                aria-label="Address line 2"
                {...register("addressLine2")}
                placeholder="Address line 2 (optional)"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <FormField id="customer-postal" label="Postal code" error={errors.postalCode?.message}>
                {(field) => <Input {...field} {...register("postalCode")} className="font-mono tabular-nums" />}
              </FormField>
              <FormField id="customer-city" label="City" error={errors.city?.message} className="col-span-2">
                {(field) => <Input {...field} {...register("city")} />}
              </FormField>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField id="customer-country" label="Country" error={errors.country?.message}>
                {(field) => <Input {...field} {...register("country")} placeholder="Denmark" />}
              </FormField>
              <FormField id="customer-vat" label="VAT / CVR" error={errors.vatNumber?.message}>
                {(field) => <Input {...field} {...register("vatNumber")} className="font-mono tabular-nums" />}
              </FormField>
            </div>
          </FormSection>

          <FormSection title="Invoices" description="Each customer has their own number series and payment terms.">
            <div className="grid grid-cols-4 gap-3">
              <FormField id="customer-invoice-code" label="Series code" error={errors.invoiceCode?.message}>
                {(field) => (
                  <Input
                    {...field}
                    {...register("invoiceCode")}
                    placeholder="Auto"
                    maxLength={10}
                    autoCapitalize="characters"
                    spellCheck={false}
                    className="font-mono uppercase"
                  />
                )}
              </FormField>
              <FormField id="customer-invoice-next" label="Next number" error={errors.invoiceNumberNext?.message}>
                {(field) => (
                  <Input
                    {...field}
                    {...register("invoiceNumberNext")}
                    inputMode="numeric"
                    className="font-mono tabular-nums"
                  />
                )}
              </FormField>
              <FormField id="customer-invoice-language" label="Language">
                {(field) => (
                  <Controller
                    control={control}
                    name="invoiceLanguage"
                    render={({ field: { value, onChange } }) => (
                      <Select value={value} onValueChange={onChange}>
                        <SelectTrigger {...field} className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {INVOICE_LANGUAGE.map((language) => (
                            <SelectItem key={language} value={language}>
                              {LANGUAGE_LABELS[language]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                )}
              </FormField>
              <FormField
                id="customer-payment-terms"
                label="Payment terms (days)"
                error={errors.paymentTermsDays?.message}
              >
                {(field) => (
                  <Controller
                    control={control}
                    name="paymentTermsDays"
                    render={({ field: { value, onChange } }) => (
                      <PaymentTermsSelect id={field.id} value={value} onValueChange={onChange} />
                    )}
                  />
                )}
              </FormField>
            </div>
            <div className="flex items-baseline justify-between gap-3 rounded-md bg-muted px-3 py-2 text-sm">
              <span className="text-muted-foreground">Next invoice</span>
              <span className="text-right">
                <span className="font-mono tabular-nums">
                  {formatInvoiceNumber(settings?.invoiceNumberPrefix ?? "", previewCode, previewNext)}
                </span>
                {hasCode ? null : (
                  <span className="block text-xs text-muted-foreground">
                    Code suggested from the name on the first invoice
                  </span>
                )}
              </span>
            </div>
          </FormSection>

          <FormField id="customer-notes" label="Notes" error={errors.notes?.message} hint="Only for you; not printed on invoices.">
            {(field) => (
              <Textarea
                {...field}
                {...register("notes")}
                rows={2}
                placeholder="Anything to remember about this customer"
              />
            )}
          </FormField>

          <DialogActions
            onCancel={() => onOpenChange(false)}
            submitLabel={customer ? "Save" : "Create customer"}
            pending={create.isPending || update.isPending}
          />
        </form>
      </DialogContent>
    </Dialog>
  );
};
