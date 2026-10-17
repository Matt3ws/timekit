import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/ui/dialog";
import { Input } from "@/ui/input";
import { FormField } from "@/components/form-field";
import { DialogActions } from "@/features/forms/dialog-actions";
import { requiredText } from "@/features/forms/fields";
import { useCreateTaskLink } from "@/queries/use-task-links";

/** Adds `https://` when the scheme is missing; null when it still isn't a web address. */
const normalizeUrl = (input: string): string | null => {
  const withScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(input) ? input : `https://${input}`;
  try {
    const url = new URL(withScheme);
    const isWeb = url.protocol === "http:" || url.protocol === "https:";
    const hasHost = url.hostname === "localhost" || url.hostname.includes(".");
    return isWeb && hasHost ? withScheme : null;
  } catch {
    return null;
  }
};

const linkSchema = z.object({
  title: requiredText("Give the link a title"),
  url: z
    .string()
    .trim()
    .min(1, "Paste the address of the page")
    .transform((value, ctx) => {
      const url = normalizeUrl(value);
      if (url === null) {
        ctx.addIssue({ code: "custom", message: "Enter a web address like docs.google.com/…" });
        return z.NEVER;
      }
      return url;
    }),
});

type LinkFormInput = z.input<typeof linkSchema>;
type LinkFormOutput = z.output<typeof linkSchema>;

interface TaskLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskId: string;
}

/** Attach a reference link (doc, report, ticket) to a task. */
export const TaskLinkDialog = ({ open, onOpenChange, taskId }: TaskLinkDialogProps): React.JSX.Element => {
  const create = useCreateTaskLink();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<LinkFormInput, unknown, LinkFormOutput>({
    resolver: zodResolver(linkSchema),
    defaultValues: { title: "", url: "" },
  });

  useEffect(() => {
    if (open) {
      reset({ title: "", url: "" });
    }
  }, [open, reset]);

  const onSubmit = handleSubmit((values) => {
    create.mutate({ taskId, ...values }, { onSuccess: () => onOpenChange(false) });
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add link</DialogTitle>
          <DialogDescription>Keep the docs and reports for this task one click away.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <FormField id="link-title" label="Title" required error={errors.title?.message}>
            {(field) => (
              <Input {...field} {...register("title")} autoFocus placeholder="PageSpeed Performance Report" />
            )}
          </FormField>
          <FormField
            id="link-url"
            label="URL"
            required
            error={errors.url?.message}
            hint="https:// is added for you if you leave it out."
          >
            {(field) => (
              <Input
                {...field}
                {...register("url")}
                type="url"
                inputMode="url"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder="https://docs.google.com/…"
              />
            )}
          </FormField>
          <DialogActions onCancel={() => onOpenChange(false)} submitLabel="Add link" pending={create.isPending} />
        </form>
      </DialogContent>
    </Dialog>
  );
};
