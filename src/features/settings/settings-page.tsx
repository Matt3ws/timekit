import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { formatDistanceToNow } from "date-fns";
import { open as openFolderDialog } from "@tauri-apps/plugin-dialog";
import { DatabaseBackup, FolderOpen, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { FormField } from "@/components/form-field";
import { Button } from "@/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/card";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";
import { Skeleton } from "@/ui/skeleton";
import { Switch } from "@/ui/switch";
import { DatePicker } from "@/ui/date-picker";
import { useSettings, useUpdateSettings } from "@/queries/use-settings";
import { useBackupNow } from "@/queries/use-bookkeeping";
import { SyncCard } from "@/features/settings/sync-card";
import { amountOrZero, optionalEmail, optionalText, percentOrZero } from "@/features/forms/fields";
import { minorToInput } from "@/lib/money";
import { formatInvoiceNumber, nextRegistrationRenewal } from "@/lib/billing";
import { cn } from "@/lib/utils";
import type { Settings } from "@/db/schema";

const DEFAULT_CURRENCY = "DKK";

const formatLongDate = (epochMs: number): string =>
  new Date(epochMs).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

interface BackupsCardProps {
  settings: Settings;
}

/**
 * Where the daily backup goes. Not part of the form: picking a folder and
 * backing up take effect immediately.
 */
const BackupsCard = ({ settings }: BackupsCardProps): React.JSX.Element => {
  const update = useUpdateSettings();
  const backup = useBackupNow();
  const { backupDir, lastBackupAt } = settings;

  const chooseFolder = async (): Promise<void> => {
    const dir = await openFolderDialog({ directory: true, title: "Choose a backup folder" });
    if (dir) {
      update.mutate({ backupDir: dir });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Backups</CardTitle>
        <CardDescription>
          A full copy of TimeKit is saved here automatically once a day. Use iCloud Drive or Dropbox so it survives a
          lost Mac. Bookkeeping must be kept for 5 years.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">Backup folder</span>
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md border border-border px-3 text-sm",
                !backupDir && "text-muted-foreground",
              )}
            >
              <FolderOpen className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="truncate font-mono text-[13px]" title={backupDir ?? undefined}>
                {backupDir ?? "No folder chosen: backups are off"}
              </span>
            </div>
            <Button type="button" variant="outline" onClick={chooseFolder} disabled={update.isPending}>
              Choose folder…
            </Button>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm">
            <span className="text-muted-foreground">Last backup: </span>
            {lastBackupAt ? (
              <span title={new Date(lastBackupAt).toLocaleString("da-DK")}>
                {formatDistanceToNow(lastBackupAt, { addSuffix: true })}
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {" "}
                  · {new Date(lastBackupAt).toLocaleString("da-DK", { dateStyle: "short", timeStyle: "short" })}
                </span>
              </span>
            ) : (
              <span>Never</span>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={!backupDir || backup.isPending}
            onClick={() => backupDir && backup.mutate({ dir: backupDir })}
          >
            {backup.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <DatabaseBackup className="size-4" aria-hidden />
            )}
            Back up now
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

const settingsSchema = z.object({
  companyName: optionalText,
  addressLine1: optionalText,
  addressLine2: optionalText,
  postalCode: optionalText,
  city: optionalText,
  country: optionalText,
  vatNumber: optionalText,
  companyRegisteredAt: z.number().nullable(),
  email: optionalEmail,
  phone: optionalText,
  bankName: optionalText,
  bankAccount: optionalText,
  iban: optionalText,
  swift: optionalText,
  defaultHourlyRate: amountOrZero,
  currency: z
    .string()
    .trim()
    .transform((value) => value.toUpperCase() || DEFAULT_CURRENCY)
    .refine((value) => /^[A-Z]{3}$/.test(value), "Use a 3-letter code like DKK or EUR"),
  vatRegistered: z.boolean(),
  defaultTaxRate: percentOrZero,
  invoiceNumberPrefix: z.string().trim(),
});

type SettingsFormInput = z.input<typeof settingsSchema>;
type SettingsFormOutput = z.output<typeof settingsSchema>;

const toFormValues = (settings: Settings): SettingsFormInput => ({
  companyName: settings.companyName ?? "",
  addressLine1: settings.addressLine1 ?? "",
  addressLine2: settings.addressLine2 ?? "",
  postalCode: settings.postalCode ?? "",
  city: settings.city ?? "",
  country: settings.country ?? "",
  vatNumber: settings.vatNumber ?? "",
  companyRegisteredAt: settings.companyRegisteredAt,
  email: settings.email ?? "",
  phone: settings.phone ?? "",
  bankName: settings.bankName ?? "",
  bankAccount: settings.bankAccount ?? "",
  iban: settings.iban ?? "",
  swift: settings.swift ?? "",
  defaultHourlyRate: minorToInput(settings.defaultHourlyRate),
  currency: settings.currency,
  vatRegistered: settings.vatRegistered,
  defaultTaxRate: (settings.defaultTaxRate / 100).toLocaleString("da-DK"),
  invoiceNumberPrefix: settings.invoiceNumberPrefix,
});

/** Business identity, billing defaults and payment details, all printed on invoices. */
export const SettingsPage = (): React.JSX.Element => {
  const { data: settings, isLoading } = useSettings();
  const update = useUpdateSettings();
  const {
    register,
    handleSubmit,
    reset,
    watch,
    control,
    formState: { errors, isDirty },
  } = useForm<SettingsFormInput, unknown, SettingsFormOutput>({
    resolver: zodResolver(settingsSchema),
  });

  useEffect(() => {
    if (settings) {
      // Backups save on their own and refetch settings: keep any unsaved edits in the form.
      reset(toFormValues(settings), { keepDirtyValues: true });
    }
  }, [settings, reset]);

  const onSubmit = handleSubmit((values) => {
    // Saved values become the new baseline, so the form is clean even when the
    // refetched settings are unchanged (e.g. "dkk" saved as "DKK").
    update.mutate(values, { onSuccess: () => reset(undefined, { keepValues: true }) });
  });

  if (isLoading || !settings) {
    return <Skeleton className="h-96 w-full" />;
  }

  const prefix = watch("invoiceNumberPrefix") ?? "";
  const vatRegistered = watch("vatRegistered") ?? settings.vatRegistered;
  const registeredAt = watch("companyRegisteredAt") ?? null;
  const renewal = registeredAt === null ? null : nextRegistrationRenewal(registeredAt);

  return (
    <form onSubmit={onSubmit} noValidate className="mx-auto flex max-w-3xl flex-col">
      <PageHeader
        title="Settings"
        description="Your business identity and billing defaults. These appear on invoices."
      />

      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Business</CardTitle>
            <CardDescription>Printed as the sender on every invoice.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <FormField id="settings-company" label="Company name" error={errors.companyName?.message}>
                {(field) => <Input {...field} {...register("companyName")} placeholder="Your company ApS" />}
              </FormField>
              <FormField id="settings-vat" label="VAT / CVR" error={errors.vatNumber?.message}>
                {(field) => <Input {...field} {...register("vatNumber")} className="font-mono tabular-nums" />}
              </FormField>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField
                id="settings-registered"
                label="Registered on"
                hint="CVR start date. A personlig mindre virksomhed must renew its registration on virk.dk every 3 years — TimeKit reminds you."
              >
                {(field) => (
                  <Controller
                    control={control}
                    name="companyRegisteredAt"
                    render={({ field: { value, onChange } }) => (
                      <DatePicker id={field.id} value={value} onChange={onChange} placeholder="Not set" />
                    )}
                  />
                )}
              </FormField>
              {renewal !== null && !vatRegistered ? (
                <div className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium">Next renewal</span>
                  <div className="flex h-9 items-center rounded-md bg-muted px-3 text-sm">{formatLongDate(renewal)}</div>
                </div>
              ) : null}
            </div>
            <div className="flex flex-col gap-2">
              <FormField id="settings-address1" label="Address" error={errors.addressLine1?.message}>
                {(field) => <Input {...field} {...register("addressLine1")} placeholder="Address line 1" />}
              </FormField>
              <Input
                aria-label="Address line 2"
                {...register("addressLine2")}
                placeholder="Address line 2 (optional)"
              />
            </div>
            <div className="grid grid-cols-[1fr_2fr_2fr] gap-3">
              <FormField id="settings-postal" label="Postal code" error={errors.postalCode?.message}>
                {(field) => <Input {...field} {...register("postalCode")} className="font-mono tabular-nums" />}
              </FormField>
              <FormField id="settings-city" label="City" error={errors.city?.message}>
                {(field) => <Input {...field} {...register("city")} />}
              </FormField>
              <FormField id="settings-country" label="Country" error={errors.country?.message}>
                {(field) => <Input {...field} {...register("country")} placeholder="Denmark" />}
              </FormField>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField id="settings-email" label="Email" error={errors.email?.message}>
                {(field) => <Input {...field} {...register("email")} type="email" />}
              </FormField>
              <FormField id="settings-phone" label="Phone" error={errors.phone?.message}>
                {(field) => <Input {...field} {...register("phone")} type="tel" />}
              </FormField>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Billing defaults</CardTitle>
            <CardDescription>Used for every project that doesn't set its own rate or currency.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-4">
                <Label htmlFor="settings-vat-registered" className="text-[13px]">
                  Moms-registered
                </Label>
                <Controller
                  control={control}
                  name="vatRegistered"
                  render={({ field: { value, onChange } }) => (
                    <Switch
                      id="settings-vat-registered"
                      checked={value}
                      onCheckedChange={onChange}
                      aria-describedby="settings-vat-registered-hint"
                    />
                  )}
                />
              </div>
              {vatRegistered ? null : (
                <p
                  id="settings-vat-registered-hint"
                  className="rounded-md bg-muted px-3 py-2.5 text-xs leading-relaxed text-muted-foreground"
                >
                  Invoices are issued without moms and say so. Turn this on when you register for moms (at the latest
                  when turnover passes 50.000 kr in 12 months).
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField
                id="settings-rate"
                label="Default hourly rate"
                error={errors.defaultHourlyRate?.message}
                hint={vatRegistered ? "incl. moms" : "no moms added"}
              >
                {(field) => (
                  <Input
                    {...field}
                    {...register("defaultHourlyRate")}
                    inputMode="decimal"
                    placeholder="850,00"
                    className="font-mono tabular-nums"
                  />
                )}
              </FormField>
              <FormField
                id="settings-currency"
                label="Currency"
                error={errors.currency?.message}
                hint={`Leave empty for ${DEFAULT_CURRENCY}`}
              >
                {(field) => (
                  <Input
                    {...field}
                    {...register("currency")}
                    placeholder={DEFAULT_CURRENCY}
                    maxLength={3}
                    autoCapitalize="characters"
                    className="font-mono uppercase"
                  />
                )}
              </FormField>
              {vatRegistered ? (
                <FormField
                  id="settings-vat-rate"
                  label="VAT (moms)"
                  error={errors.defaultTaxRate?.message}
                  hint="Percent, e.g. 25"
                >
                  {(field) => (
                    <Input
                      {...field}
                      {...register("defaultTaxRate")}
                      inputMode="decimal"
                      placeholder="25"
                      className="font-mono tabular-nums"
                    />
                  )}
                </FormField>
              ) : null}
              <FormField id="settings-prefix" label="Invoice number prefix" error={errors.invoiceNumberPrefix?.message}>
                {(field) => (
                  <Input
                    {...field}
                    {...register("invoiceNumberPrefix")}
                    placeholder="2026-"
                    spellCheck={false}
                    className="font-mono"
                  />
                )}
              </FormField>
            </div>
            <p className="rounded-md bg-muted px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
              Each customer has its own number series: prefix + the customer's series code + their own sequence,
              e.g. <span className="font-mono text-foreground">{formatInvoiceNumber(prefix, "FIN", 1)}</span>. Set the
              code and next number on the customer.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payment details</CardTitle>
            <CardDescription>Where customers pay; shown at the bottom of each invoice.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <FormField id="settings-bank" label="Bank name" error={errors.bankName?.message}>
              {(field) => <Input {...field} {...register("bankName")} />}
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField id="settings-account" label="Account number" error={errors.bankAccount?.message}>
                {(field) => (
                  <Input {...field} {...register("bankAccount")} placeholder="1234 0001234567" className="font-mono" />
                )}
              </FormField>
              <FormField id="settings-swift" label="SWIFT / BIC" error={errors.swift?.message}>
                {(field) => <Input {...field} {...register("swift")} className="font-mono uppercase" />}
              </FormField>
            </div>
            <FormField id="settings-iban" label="IBAN" error={errors.iban?.message}>
              {(field) => (
                <Input {...field} {...register("iban")} placeholder="DK00 0000 0000 0000 00" className="font-mono" />
              )}
            </FormField>
          </CardContent>
        </Card>

        <BackupsCard settings={settings} />

        <SyncCard />
      </div>

      <div className="sticky bottom-4 z-10 mt-6 flex items-center justify-end gap-3 rounded-lg border border-border bg-background/90 px-4 py-2.5 shadow-sm backdrop-blur">
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {isDirty ? "Unsaved changes" : "All changes saved"}
        </span>
        <Button type="submit" disabled={!isDirty || update.isPending} className="min-w-20">
          {update.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          Save
        </Button>
      </div>
    </form>
  );
};
