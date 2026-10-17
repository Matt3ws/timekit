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
import { FormField } from "@/components/form-field";
import { DialogActions } from "@/features/forms/dialog-actions";
import { optionalText, requiredText } from "@/features/forms/fields";
import { useCreateTask, useUpdateTask } from "@/queries/use-tasks";
import { TASK_STATUS, TASK_STATUS_LABELS, type Task } from "@/db/schema";

const taskSchema = z.object({
  title: requiredText("Give the task a title"),
  description: optionalText,
  status: z.enum(TASK_STATUS),
});

type TaskFormInput = z.input<typeof taskSchema>;
type TaskFormOutput = z.output<typeof taskSchema>;

interface TaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  task?: Task;
}

/** Create or edit a task within a project. */
export const TaskDialog = ({
  open,
  onOpenChange,
  projectId,
  task,
}: TaskDialogProps): React.JSX.Element => {
  const create = useCreateTask();
  const update = useUpdateTask();
  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<TaskFormInput, unknown, TaskFormOutput>({
    resolver: zodResolver(taskSchema),
    defaultValues: { title: "", description: "", status: "todo" },
  });

  useEffect(() => {
    if (open) {
      reset({
        title: task?.title ?? "",
        description: task?.description ?? "",
        status: task?.status ?? "todo",
      });
    }
  }, [open, task, reset]);

  const onSubmit = handleSubmit((values) => {
    const close = { onSuccess: () => onOpenChange(false) };
    if (task) {
      update.mutate({ id: task.id, projectId, ...values }, close);
    } else {
      create.mutate({ projectId, ...values }, close);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{task ? "Edit task" : "New task"}</DialogTitle>
          <DialogDescription>Tasks are what you track time on and what invoices bill, one line each.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <FormField id="task-title" label="Title" required error={errors.title?.message}>
            {(field) => <Input {...field} {...register("title")} autoFocus placeholder="Homepage redesign" />}
          </FormField>
          <FormField id="task-description" label="Description" error={errors.description?.message}>
            {(field) => <Textarea {...field} {...register("description")} rows={3} placeholder="Optional details" />}
          </FormField>
          <FormField id="task-status" label="Status" error={errors.status?.message}>
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
                      {TASK_STATUS.map((status) => (
                        <SelectItem key={status} value={status}>
                          {TASK_STATUS_LABELS[status]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            )}
          </FormField>
          <DialogActions
            onCancel={() => onOpenChange(false)}
            submitLabel={task ? "Save" : "Create task"}
            pending={create.isPending || update.isPending}
          />
        </form>
      </DialogContent>
    </Dialog>
  );
};
