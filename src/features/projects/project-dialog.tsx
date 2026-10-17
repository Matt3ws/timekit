import { useEffect } from "react";
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
import { DatePicker } from "@/ui/date-picker";
import { FormField, FormSection } from "@/components/form-field";
import { DialogActions } from "@/features/forms/dialog-actions";
import {
  AMOUNT_MESSAGE,
  optionalCurrency,
  optionalHoursAsMinutes,
  optionalText,
  parseAmount,
  requiredText,
} from "@/features/forms/fields";
import { useCustomers } from "@/queries/use-customers";
import { useCreateProject, useUpdateProject } from "@/queries/use-projects";
import { useSettings } from "@/queries/use-settings";
import { BILLING_TYPE, PROJECT_STATUS, type Project, type ProjectStatus } from "@/db/schema";
import { formatMoney, minorToInput } from "@/lib/money";

const projectSchema = z
  .object({
    title: requiredText("Give the project a title"),
    customerId: z.string().min(1, "Choose a customer"),
    description: optionalText,
    status: z.enum(PROJECT_STATUS),
    billingType: z.enum(BILLING_TYPE),
    // Parsed below: only the field for the chosen billing type is validated.
    hourlyRate: z.string().trim(),
    fixedPrice: z.string().trim(),
    currency: optionalCurrency,
    estimatedMinutes: optionalHoursAsMinutes,
    startDate: z.number().nullable(),
    endDate: z.number().nullable(),
  })
  .superRefine((values, ctx) => {
    const visible = values.billingType === "hourly" ? "hourlyRate" : "fixedPrice";
    if (values[visible] && parseAmount(values[visible]) === null) {
      ctx.addIssue({ code: "custom", path: [visible], message: AMOUNT_MESSAGE });
    }
    if (values.startDate !== null && values.endDate !== null && values.endDate < values.startDate) {
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "The deadline is before the start" });
    }
  })
  .transform(({ hourlyRate, fixedPrice, ...rest }) => ({
    ...rest,
    // A hidden field keeps its value unless it no longer parses.
    hourlyRate: hourlyRate ? parseAmount(hourlyRate) : null,
    fixedPrice: fixedPrice ? parseAmount(fixedPrice) : null,
  }));

type ProjectFormInput = z.input<typeof projectSchema>;
type ProjectFormOutput = z.output<typeof projectSchema>;

interface ProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project?: Project;
  defaultCustomerId?: string;
}

const STATUS_LABELS: Record<ProjectStatus, string> = {
  draft: "Draft",
  active: "Active",
  on_hold: "On hold",
  completed: "Completed",
  archived: "Archived",
};

interface InitialValuesInput {
  project?: Project;
  defaultCustomerId?: string;
}

const initialValues = ({ project, defaultCustomerId }: InitialValuesInput): ProjectFormInput => ({
  title: project?.title ?? "",
  customerId: project?.customerId ?? defaultCustomerId ?? "",
  description: project?.description ?? "",
  status: project?.status ?? "draft",
  billingType: project?.billingType ?? "hourly",
  hourlyRate: project?.hourlyRate != null ? minorToInput(project.hourlyRate) : "",
  fixedPrice: project?.fixedPrice != null ? minorToInput(project.fixedPrice) : "",
  currency: project?.currency ?? "",
  estimatedMinutes:
    project?.estimatedMinutes != null
      ? (project.estimatedMinutes / 60).toLocaleString("da-DK", { maximumFractionDigits: 2 })
      : "",
  startDate: project?.startDate ?? null,
  endDate: project?.endDate ?? null,
});

/** Create or edit a project: customer, billing (hourly or fixed), estimate and dates. */
export const ProjectDialog = ({
  open,
  onOpenChange,
  project,
  defaultCustomerId,
}: ProjectDialogProps): React.JSX.Element => {
  const { data: customers } = useCustomers();
  const { data: settings } = useSettings();
  const create = useCreateProject();
  const update = useUpdateProject();
  const {
    register,
    handleSubmit,
    reset,
    control,
    watch,
    formState: { errors },
  } = useForm<ProjectFormInput, unknown, ProjectFormOutput>({
    resolver: zodResolver(projectSchema),
    defaultValues: initialValues({ project, defaultCustomerId }),
  });

  useEffect(() => {
    if (open) {
      reset(initialValues({ project, defaultCustomerId }));
    }
  }, [open, project, defaultCustomerId, reset]);

  const billingType = watch("billingType");
  const defaultRate = settings ? formatMoney(settings.defaultHourlyRate, settings.currency) : undefined;

  const onSubmit = handleSubmit((values) => {
    const close = { onSuccess: () => onOpenChange(false) };
    if (project) {
      update.mutate({ id: project.id, ...values }, close);
    } else {
      create.mutate(values, close);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{project ? "Edit project" : "New project"}</DialogTitle>
          <DialogDescription>Projects group tasks for one customer and set how the work is billed.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <FormField id="project-title" label="Title" required error={errors.title?.message}>
            {(field) => <Input {...field} {...register("title")} autoFocus placeholder="Website relaunch" />}
          </FormField>

          <FormField id="project-customer" label="Customer" required error={errors.customerId?.message}>
            {(field) => (
              <Controller
                control={control}
                name="customerId"
                render={({ field: { value, onChange } }) => (
                  <Select value={value} onValueChange={onChange}>
                    <SelectTrigger {...field} className="w-full">
                      <SelectValue placeholder="Select a customer" />
                    </SelectTrigger>
                    <SelectContent>
                      {customers?.map((customer) => (
                        <SelectItem key={customer.id} value={customer.id}>
                          {customer.companyName ?? customer.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            )}
          </FormField>

          <FormField id="project-description" label="Description" error={errors.description?.message}>
            {(field) => (
              <Textarea {...field} {...register("description")} rows={2} placeholder="Scope, links, agreements" />
            )}
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField id="project-status" label="Status">
              {(field) => (
                <Controller
                  control={control}
                  name="status"
                  render={({ field: { value, onChange } }) => (
                    <Select value={value} onValueChange={onChange}>
                      <SelectTrigger {...field} className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PROJECT_STATUS.map((status) => (
                          <SelectItem key={status} value={status}>
                            {STATUS_LABELS[status]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              )}
            </FormField>
            <FormField id="project-billing" label="Billing">
              {(field) => (
                <Controller
                  control={control}
                  name="billingType"
                  render={({ field: { value, onChange } }) => (
                    <Select value={value} onValueChange={onChange}>
                      <SelectTrigger {...field} className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hourly">Hourly</SelectItem>
                        <SelectItem value="fixed">Fixed price</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              )}
            </FormField>
          </div>

          <FormSection title="Money & time">
            <div className="grid grid-cols-2 gap-3">
              {billingType === "hourly" ? (
                <FormField
                  id="project-rate"
                  label="Hourly rate"
                  error={errors.hourlyRate?.message}
                  hint="incl. moms — leave empty to use the default"
                >
                  {(field) => (
                    <Input
                      {...field}
                      {...register("hourlyRate")}
                      inputMode="decimal"
                      placeholder={defaultRate ?? "Default rate"}
                      className="font-mono tabular-nums"
                    />
                  )}
                </FormField>
              ) : (
                <FormField
                  id="project-fixed-price"
                  label="Fixed price"
                  error={errors.fixedPrice?.message}
                  hint="incl. moms"
                >
                  {(field) => (
                    <Input
                      {...field}
                      {...register("fixedPrice")}
                      inputMode="decimal"
                      placeholder="0,00"
                      className="font-mono tabular-nums"
                    />
                  )}
                </FormField>
              )}
              <FormField
                id="project-currency"
                label="Currency"
                error={errors.currency?.message}
                hint="Leave empty to use the default"
              >
                {(field) => (
                  <Input
                    {...field}
                    {...register("currency")}
                    placeholder={settings?.currency ?? "DKK"}
                    maxLength={3}
                    autoCapitalize="characters"
                    className="font-mono uppercase"
                  />
                )}
              </FormField>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <FormField id="project-estimate" label="Estimate (hours)" error={errors.estimatedMinutes?.message}>
                {(field) => (
                  <Input
                    {...field}
                    {...register("estimatedMinutes")}
                    inputMode="decimal"
                    placeholder="40"
                    className="font-mono tabular-nums"
                  />
                )}
              </FormField>
              <FormField id="project-start" label="Start" error={errors.startDate?.message}>
                <Controller
                  control={control}
                  name="startDate"
                  render={({ field }) => (
                    <DatePicker id="project-start" value={field.value} onChange={field.onChange} placeholder="Start" />
                  )}
                />
              </FormField>
              <FormField id="project-deadline" label="Deadline" error={errors.endDate?.message}>
                <Controller
                  control={control}
                  name="endDate"
                  render={({ field }) => (
                    <DatePicker
                      id="project-deadline"
                      value={field.value}
                      onChange={field.onChange}
                      placeholder="Deadline"
                    />
                  )}
                />
              </FormField>
            </div>
          </FormSection>

          <DialogActions
            onCancel={() => onOpenChange(false)}
            submitLabel={project ? "Save" : "Create project"}
            pending={create.isPending || update.isPending}
          />
        </form>
      </DialogContent>
    </Dialog>
  );
};
