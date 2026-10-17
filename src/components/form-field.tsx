import { useId } from "react";
import { cn } from "@/lib/utils";
import { Label } from "@/ui/label";

/** Accessibility props a form control needs to be tied to its label and message. */
export interface FieldControlProps {
  id: string;
  "aria-invalid"?: true;
  "aria-describedby"?: string;
}

interface FormFieldProps {
  /** The control's id; the label's `htmlFor` points at it. */
  id: string;
  label: React.ReactNode;
  required?: boolean;
  /** Helper text under the control, hidden while an error is shown. */
  hint?: React.ReactNode;
  /** Validation message; shown inline under the control. */
  error?: string;
  className?: string;
  /**
   * The control. Pass a render function to receive the `id` / `aria-*` props
   * that link the control to the label and the hint/error text.
   */
  children: React.ReactNode | ((control: FieldControlProps) => React.ReactNode);
}

/**
 * One labelled form row: label (with a required marker), control, then either the
 * inline error or the hint.
 *
 * @example
 * <FormField id="customer-name" label="Name" required error={errors.name?.message}>
 *   {(control) => <Input {...control} {...register("name")} />}
 * </FormField>
 */
export const FormField = ({
  id,
  label,
  required = false,
  hint,
  error,
  className,
  children,
}: FormFieldProps): React.JSX.Element => {
  const messageId = `${id}-message`;
  const hasMessage = Boolean(error) || Boolean(hint);
  const control: FieldControlProps = {
    id,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": hasMessage ? messageId : undefined,
  };

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id} className="gap-1 text-[13px]">
        {label}
        {required ? (
          <span aria-hidden className="text-ember">
            *
          </span>
        ) : null}
        {required ? <span className="sr-only">(required)</span> : null}
      </Label>
      {typeof children === "function" ? children(control) : children}
      {error ? (
        <p id={messageId} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={messageId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
};

interface FormSectionProps {
  title: string;
  description?: string;
  className?: string;
  children: React.ReactNode;
}

/** A titled group of fields inside a dialog, separated by a hairline above. */
export const FormSection = ({ title, description, className, children }: FormSectionProps): React.JSX.Element => {
  const titleId = useId();
  return (
    <div role="group" aria-labelledby={titleId} className={cn("flex flex-col gap-4 border-t border-border pt-4", className)}>
      <div className="flex flex-col gap-1">
        <h3 id={titleId} className="label-caps">
          {title}
        </h3>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </div>
  );
};
