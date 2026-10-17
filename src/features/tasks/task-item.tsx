import { useState } from "react";
import {
  Play,
  Square,
  Check,
  ChevronRight,
  MoreHorizontal,
  Pencil,
  Trash2,
  Plus,
  RotateCcw,
  CornerDownRight,
  Link2,
  ExternalLink,
  Lock,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { LiveDuration } from "@/components/live-duration";
import { TaskStatusSelect } from "@/features/tasks/task-status-select";
import { TaskLinkDialog } from "@/features/tasks/task-link-dialog";
import { TaskDialog } from "@/features/tasks/task-dialog";
import { TimeEntryDialog } from "@/features/tasks/time-entry-dialog";
import { useTaskLinks, useDeleteTaskLink } from "@/queries/use-task-links";
import {
  useActiveTimer,
  useStartTimer,
  useStopTimer,
  useResumeTimer,
  useDeleteTimeEntry,
  useTimeEntries,
  type ActiveTimer,
} from "@/queries/use-time-entries";
import { useUpdateTask, useDeleteTask, type TaskWithTime } from "@/queries/use-tasks";
import { formatDuration } from "@/lib/duration";
import type { TaskStatus, TimeEntry } from "@/db/schema";

const formatRange = (entry: TimeEntry): string => {
  const start = new Date(entry.startedAt);
  const date = start.toLocaleDateString("da-DK", { day: "2-digit", month: "short" });
  const startTime = start.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });
  const endTime = entry.endedAt
    ? new Date(entry.endedAt).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" })
    : "running";
  return `${date} · ${startTime}–${endTime}`;
};

/** The ember fill for "this button starts time". */
const EMBER_BUTTON = "bg-ember text-ember-foreground shadow-xs hover:bg-ember/90";

interface TaskTimeProps {
  task: TaskWithTime;
  /** The running timer when it belongs to this task. */
  running: ActiveTimer | undefined;
}

/** Tracked time with the unbilled share underneath; ticks (in isolation) while this task runs. */
const TaskTime = ({ task, running }: TaskTimeProps): React.JSX.Element => {
  if (running) {
    return (
      <div className="flex items-center justify-end gap-2">
        <span className="relative flex size-2 shrink-0" aria-hidden>
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-ember opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-ember" />
        </span>
        <LiveDuration
          startedAt={running.startedAt}
          baseSeconds={task.trackedSeconds}
          className="font-mono text-[15px] font-semibold tabular-nums text-ember"
        />
      </div>
    );
  }
  if (task.trackedSeconds === 0) {
    return <span className="font-mono text-sm tabular-nums text-muted-foreground/60">—</span>;
  }
  return (
    <div className="leading-tight">
      <div className="font-mono text-sm tabular-nums">{formatDuration(task.trackedSeconds)}</div>
      {task.billedSeconds === 0 ? (
        <div className="text-[11px] text-muted-foreground/80">unbilled</div>
      ) : task.unbilledSeconds > 0 ? (
        <div className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {formatDuration(task.unbilledSeconds)} unbilled
        </div>
      ) : (
        <div className="text-[11px] text-success">all billed</div>
      )}
    </div>
  );
};

interface SectionHeaderProps {
  label: string;
  actionLabel: string;
  onAction: () => void;
}

const SectionHeader = ({ label, actionLabel, onAction }: SectionHeaderProps): React.JSX.Element => (
  <div className="mb-1.5 flex items-center justify-between">
    <span className="label-caps">{label}</span>
    <Button size="xs" variant="ghost" className="text-muted-foreground" onClick={onAction}>
      <Plus className="size-3" />
      {actionLabel}
    </Button>
  </div>
);

interface TaskItemProps {
  task: TaskWithTime;
  projectId: string;
}

/**
 * One task row: one-click Done, the Start/Stop timer control, tracked vs
 * unbilled time and a menu for the rest. Expands to show its time entries
 * (resume, edit, delete unbilled ones) and its documents & links.
 */
export const TaskItem = ({ task, projectId }: TaskItemProps): React.JSX.Element => {
  const { data: active } = useActiveTimer();
  const start = useStartTimer();
  const stop = useStopTimer();
  const resume = useResumeTimer();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const deleteEntry = useDeleteTimeEntry();

  const [expanded, setExpanded] = useState(false);
  const { data: entries } = useTimeEntries(expanded ? task.id : undefined);
  const { data: links } = useTaskLinks(expanded ? task.id : undefined);
  const deleteLink = useDeleteTaskLink();

  const [editTaskOpen, setEditTaskOpen] = useState(false);
  const [deleteTaskOpen, setDeleteTaskOpen] = useState(false);
  const [entryDialogOpen, setEntryDialogOpen] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TimeEntry | undefined>(undefined);
  const [entryToDelete, setEntryToDelete] = useState<TimeEntry | undefined>(undefined);

  const openLink = (url: string): void => {
    openUrl(url).catch(() => toast.error("Couldn't open the link"));
  };

  const running = active && active.taskId === task.id ? active : undefined;
  const isDone = task.status === "done";

  const changeStatus = (status: TaskStatus): void => {
    updateTask.mutate({ id: task.id, projectId, status });
  };

  const openAddManual = (): void => {
    setEditingEntry(undefined);
    setEntryDialogOpen(true);
  };

  const openEditEntry = (entry: TimeEntry): void => {
    setEditingEntry(entry);
    setEntryDialogOpen(true);
  };

  return (
    <div
      className={cn(
        "rounded-xl border bg-card transition-colors",
        running ? "border-ember-line bg-ember-soft/35 shadow-sm" : "border-border hover:border-foreground/15",
      )}
    >
      <div className="flex items-center gap-3 py-2 pl-3.5 pr-2">
        <button
          type="button"
          role="checkbox"
          aria-checked={isDone}
          aria-label={isDone ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`}
          title={isDone ? "Mark as not done" : "Mark as done"}
          onClick={() => changeStatus(isDone ? "todo" : "done")}
          disabled={updateTask.isPending}
          className={cn(
            "flex size-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50",
            isDone
              ? "border-success bg-success text-background"
              : "border-muted-foreground/35 text-transparent hover:border-success hover:bg-success-soft hover:text-success",
          )}
        >
          <Check className="size-3" strokeWidth={3} />
        </button>

        <button
          type="button"
          aria-expanded={expanded}
          className="group flex min-w-0 flex-1 items-center gap-1.5 rounded-md py-1 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          onClick={() => setExpanded((value) => !value)}
        >
          <ChevronRight
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground/70 transition-transform group-hover:text-foreground",
              expanded && "rotate-90",
            )}
            aria-hidden
          />
          <span className="min-w-0">
            <span
              className={cn(
                "block truncate text-sm font-medium",
                isDone && "font-normal text-muted-foreground line-through decoration-muted-foreground/50",
              )}
            >
              {task.title}
            </span>
            {task.description && !expanded ? (
              <span className="block truncate text-xs text-muted-foreground">{task.description}</span>
            ) : null}
          </span>
        </button>

        <TaskStatusSelect status={task.status} onChange={changeStatus} className="shrink-0" />

        <div className="w-24 shrink-0 text-right">
          <TaskTime task={task} running={running} />
        </div>

        {running ? (
          <Button
            size="sm"
            className="w-[76px] gap-1.5"
            onClick={() => stop.mutate()}
            disabled={stop.isPending}
            aria-label={`Stop timer on ${task.title}`}
          >
            <Square className="size-3 fill-current" />
            Stop
          </Button>
        ) : (
          <Button
            size="sm"
            variant={isDone ? "outline" : "default"}
            className={cn("w-[76px] gap-1.5", !isDone && EMBER_BUTTON)}
            onClick={() => start.mutate({ taskId: task.id, description: task.title })}
            disabled={start.isPending}
            aria-label={`Start timer on ${task.title}`}
          >
            <Play className="size-3 fill-current" />
            Start
          </Button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground"
              aria-label={`Actions for ${task.title}`}
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setEditTaskOpen(true)}>
              <Pencil className="size-4" />
              Edit task
            </DropdownMenuItem>
            <DropdownMenuItem onClick={openAddManual}>
              <Plus className="size-4" />
              Add time
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setLinkDialogOpen(true)}>
              <Link2 className="size-4" />
              Add link
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => setDeleteTaskOpen(true)}>
              <Trash2 className="size-4" />
              Delete task
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {expanded ? (
        <div className="rounded-b-xl border-t border-border/70 bg-foreground/[0.02] px-4 pb-3 pt-2.5 dark:bg-foreground/[0.03]">
          {task.description ? (
            <p className="mb-3 whitespace-pre-line text-sm text-muted-foreground">{task.description}</p>
          ) : null}

          <SectionHeader label="Time entries" actionLabel="Add time" onAction={openAddManual} />
          {!entries || entries.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">No time tracked yet. Press Start or add time by hand.</p>
          ) : (
            <ul className="space-y-1">
              {entries.map((entry) => {
                const entryRunning = !entry.endedAt;
                return (
                  <li
                    key={entry.id}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border border-transparent bg-background px-3 py-1.5 text-sm",
                      entryRunning && "border-ember-line/60",
                    )}
                  >
                    {entry.resumedFromId ? (
                      <CornerDownRight className="size-3.5 shrink-0 text-muted-foreground" aria-label="Resumed" />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{entry.description ?? "-"}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatRange(entry)}
                        {entry.isManual ? " · manual" : ""}
                      </div>
                    </div>
                    <span className="w-16 shrink-0 text-right font-mono tabular-nums">
                      {entry.endedAt ? (
                        formatDuration(entry.durationSeconds ?? 0)
                      ) : running && running.id === entry.id ? (
                        <LiveDuration startedAt={running.startedAt} format="short" className="text-ember" />
                      ) : (
                        "-"
                      )}
                    </span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7 text-muted-foreground"
                      title="Resume"
                      aria-label="Resume this entry"
                      onClick={() => resume.mutate({ entryId: entry.id })}
                      disabled={resume.isPending || entryRunning}
                    >
                      <RotateCcw className="size-3.5" />
                    </Button>
                    {entry.billedInvoiceId ? (
                      // On an issued invoice: locked. Credit the invoice to change it.
                      <span
                        className="flex h-7 w-[60px] items-center justify-center gap-1 text-xs text-muted-foreground"
                        title="Invoiced: credit the invoice to change this entry"
                      >
                        <Lock className="size-3.5" aria-hidden />
                        Billed
                      </span>
                    ) : (
                      <span className="flex w-[60px] justify-end">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7 text-muted-foreground"
                          title="Edit"
                          aria-label="Edit time entry"
                          onClick={() => openEditEntry(entry)}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7 text-muted-foreground hover:text-destructive"
                          title="Delete"
                          aria-label="Delete time entry"
                          onClick={() => setEntryToDelete(entry)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-4">
            <SectionHeader label="Documents & links" actionLabel="Add link" onAction={() => setLinkDialogOpen(true)} />
          </div>
          {!links || links.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">No links yet.</p>
          ) : (
            <ul className="space-y-1">
              {links.map((link) => (
                <li key={link.id} className="flex items-center gap-2 rounded-lg bg-background px-3 py-1.5 text-sm">
                  <Link2 className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  <button
                    type="button"
                    onClick={() => openLink(link.url)}
                    className="min-w-0 flex-1 truncate rounded-sm text-left outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    title={link.url}
                  >
                    {link.title}
                  </button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7 text-muted-foreground"
                    title="Open link"
                    aria-label={`Open ${link.title}`}
                    onClick={() => openLink(link.url)}
                  >
                    <ExternalLink className="size-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7 text-muted-foreground hover:text-destructive"
                    title="Remove link"
                    aria-label={`Remove ${link.title}`}
                    onClick={() => deleteLink.mutate({ id: link.id, taskId: task.id })}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <TaskDialog open={editTaskOpen} onOpenChange={setEditTaskOpen} projectId={projectId} task={task} />
      <TaskLinkDialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen} taskId={task.id} />
      <TimeEntryDialog
        open={entryDialogOpen}
        onOpenChange={setEntryDialogOpen}
        taskId={task.id}
        entry={editingEntry}
      />
      <ConfirmDialog
        open={deleteTaskOpen}
        onOpenChange={setDeleteTaskOpen}
        title={`Delete "${task.title}"?`}
        description="This deletes the task and all its tracked time."
        confirmLabel="Delete"
        onConfirm={() => deleteTask.mutate({ id: task.id, projectId })}
      />
      <ConfirmDialog
        open={Boolean(entryToDelete)}
        onOpenChange={(open) => !open && setEntryToDelete(undefined)}
        title="Delete this time entry?"
        confirmLabel="Delete"
        onConfirm={() => {
          if (entryToDelete) {
            deleteEntry.mutate({ id: entryToDelete.id });
            setEntryToDelete(undefined);
          }
        }}
      />
    </div>
  );
};
