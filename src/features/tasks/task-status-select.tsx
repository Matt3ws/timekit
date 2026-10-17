import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/ui/select";
import { TASK_STATUS, TASK_STATUS_LABELS, type TaskStatus } from "@/db/schema";

const DOT: Record<TaskStatus, string> = {
  backlog: "bg-muted-foreground/40",
  todo: "bg-muted-foreground/70",
  in_progress: "bg-info",
  done: "bg-success",
};

/** Trigger tint per status: quiet for backlog/todo, coloured once work moves. */
const TRIGGER: Record<TaskStatus, string> = {
  backlog: "bg-transparent dark:bg-transparent text-muted-foreground",
  todo: "bg-foreground/[0.05] dark:bg-foreground/[0.07] text-foreground/80",
  in_progress: "bg-info-soft dark:bg-info-soft text-info",
  done: "bg-success-soft dark:bg-success-soft text-success",
};

interface TaskStatusSelectProps {
  status: TaskStatus;
  onChange: (status: TaskStatus) => void;
  className?: string;
}

/** Compact status picker (Backlog / Todo / In progress / Done) as a tinted chip with a coloured dot. */
export const TaskStatusSelect = ({
  status,
  onChange,
  className,
}: TaskStatusSelectProps): React.JSX.Element => (
  <Select value={status} onValueChange={(value) => onChange(value as TaskStatus)}>
    <SelectTrigger
      aria-label={`Status: ${TASK_STATUS_LABELS[status]}`}
      className={cn(
        "w-auto gap-1 rounded-full border-transparent px-2 py-0 text-[11.5px] font-medium shadow-none data-[size=default]:h-6 [&>svg]:size-3",
        TRIGGER[status],
        className,
      )}
    >
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      {TASK_STATUS.map((value) => (
        <SelectItem key={value} value={value}>
          <span className="flex items-center gap-2">
            <span className={cn("size-1.5 shrink-0 rounded-full", DOT[value])} />
            {TASK_STATUS_LABELS[value]}
          </span>
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);
