import { useEffect, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { isAfter, isSameDay, startOfDay } from "date-fns";
import { Clock, Timer } from "lucide-react";
import { Button } from "@/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/ui/dialog";
import { Input } from "@/ui/input";
import { Textarea } from "@/ui/textarea";
import { DatePicker, DateTimePicker } from "@/ui/date-picker";
import { FormField } from "@/components/form-field";
import { DialogActions } from "@/features/forms/dialog-actions";
import { DURATION_MESSAGE, optionalText } from "@/features/forms/fields";
import { useAddManualEntry, useEditTimeEntry } from "@/queries/use-time-entries";
import { formatDuration, parseDuration } from "@/lib/duration";
import type { TimeEntry } from "@/db/schema";

/** A quick entry on an earlier day is placed so it ends at this hour. */
const QUICK_END_HOUR = 17;
const MAX_DURATION_SECONDS = 24 * 60 * 60;
const DEFAULT_RANGE_MS = 30 * 60 * 1000;

const ENTRY_MODE = ["duration", "range"] as const;
type EntryMode = (typeof ENTRY_MODE)[number];

interface TimeRange {
  startedAt: number;
  endedAt: number;
}

interface QuickRangeInput {
  date: number;
  durationSeconds: number;
  now: number;
}

/**
 * Where a quick (date + duration) entry lands: today it ends now; on another day
 * it ends at 17:00. It starts `durationSeconds` before that.
 */
const quickRange = ({ date, durationSeconds, now }: QuickRangeInput): TimeRange => {
  const day = new Date(date);
  const endedAt = isSameDay(day, now)
    ? now
    : new Date(day.getFullYear(), day.getMonth(), day.getDate(), QUICK_END_HOUR).getTime();
  return { startedAt: endedAt - durationSeconds * 1000, endedAt };
};

const pad = (value: number): string => String(value).padStart(2, "0");

const clockTime = (ms: number): string => {
  const date = new Date(ms);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

/** Seconds as a typed duration the form can parse back, e.g. 5400 → "1:30". */
const toDurationInput = (seconds: number): string =>
  `${Math.floor(seconds / 3600)}:${pad(Math.floor((seconds % 3600) / 60))}`;

interface EntrySchemaOptions {
  /** Editing the running entry: there is no end, the start must be in the past. */
  running: boolean;
}

const entrySchema = ({ running }: EntrySchemaOptions) =>
  z
    .object({
      mode: z.enum(ENTRY_MODE),
      date: z.number().nullable(),
      duration: z.string(),
      startedAt: z.number(),
      endedAt: z.number(),
      description: optionalText,
    })
    .superRefine((values, ctx) => {
      const now = Date.now();
      if (values.mode === "duration") {
        if (values.date === null) {
          ctx.addIssue({ code: "custom", path: ["date"], message: "Pick the day you worked" });
        } else if (isAfter(startOfDay(values.date), now)) {
          ctx.addIssue({ code: "custom", path: ["date"], message: "Pick today or an earlier day" });
        }
        const seconds = parseDuration(values.duration);
        if (seconds === null) {
          ctx.addIssue({ code: "custom", path: ["duration"], message: DURATION_MESSAGE });
        } else if (seconds > MAX_DURATION_SECONDS) {
          ctx.addIssue({
            code: "custom",
            path: ["duration"],
            message: "That's more than a day. Split it up, or set start and end times.",
          });
        }
        return;
      }
      if (running) {
        if (values.startedAt >= now) {
          ctx.addIssue({ code: "custom", path: ["startedAt"], message: "Start must be in the past" });
        }
        return;
      }
      if (values.endedAt <= values.startedAt) {
        ctx.addIssue({ code: "custom", path: ["endedAt"], message: "End must be after start" });
      }
    })
    .transform((values) => {
      if (values.mode === "duration") {
        const range = quickRange({
          date: values.date ?? startOfDay(Date.now()).getTime(),
          durationSeconds: parseDuration(values.duration) ?? 0,
          now: Date.now(),
        });
        return { ...range, description: values.description };
      }
      return {
        startedAt: values.startedAt,
        endedAt: running ? null : values.endedAt,
        description: values.description,
      };
    });

type EntrySchema = ReturnType<typeof entrySchema>;
type EntryFormInput = z.input<EntrySchema>;
type EntryFormOutput = z.output<EntrySchema>;

/** Fresh form values: a quick entry for today when adding, the entry's own times when editing. */
const initialValues = (entry: TimeEntry | undefined): EntryFormInput => {
  const now = Date.now();
  return {
    mode: entry ? "range" : "duration",
    date: startOfDay(now).getTime(),
    duration: "",
    startedAt: entry?.startedAt ?? now - DEFAULT_RANGE_MS,
    endedAt: entry?.endedAt ?? now,
    description: entry?.description ?? "",
  };
};

interface TimeEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskId: string;
  entry?: TimeEntry;
}

/**
 * Add time to a task, or edit an existing entry. Adding defaults to a quick
 * "date + duration" entry; start and end times are one click away. Editing works
 * on start and end; the running entry keeps running (only its start and note change).
 */
export const TimeEntryDialog = ({
  open,
  onOpenChange,
  taskId,
  entry,
}: TimeEntryDialogProps): React.JSX.Element => {
  const edit = useEditTimeEntry();
  const addManual = useAddManualEntry();
  const running = entry !== undefined && entry.endedAt === null;
  const schema = useMemo(() => entrySchema({ running }), [running]);
  const {
    register,
    handleSubmit,
    reset,
    control,
    watch,
    getValues,
    setValue,
    clearErrors,
    formState: { errors },
  } = useForm<EntryFormInput, unknown, EntryFormOutput>({
    resolver: zodResolver(schema),
    defaultValues: initialValues(entry),
  });

  useEffect(() => {
    if (open) {
      reset(initialValues(entry));
    }
  }, [open, entry, reset]);

  const mode = watch("mode");
  const date = watch("date");
  const durationText = watch("duration");
  const startedAt = watch("startedAt");
  const endedAt = running ? Date.now() : watch("endedAt");

  /** Switch modes, carrying the time across so nothing typed is lost. */
  const switchMode = (next: EntryMode): void => {
    const values = getValues();
    if (next === "range") {
      const seconds = parseDuration(values.duration);
      if (seconds !== null && values.date !== null) {
        const range = quickRange({ date: values.date, durationSeconds: seconds, now: Date.now() });
        setValue("startedAt", range.startedAt);
        setValue("endedAt", range.endedAt);
      }
    } else if (values.endedAt > values.startedAt) {
      setValue("date", startOfDay(values.endedAt).getTime());
      setValue("duration", toDurationInput(Math.round((values.endedAt - values.startedAt) / 1000)));
    }
    clearErrors();
    setValue("mode", next);
  };

  const onSubmit = handleSubmit((values) => {
    const close = { onSuccess: () => onOpenChange(false) };
    if (entry) {
      edit.mutate({ id: entry.id, ...values }, close);
      return;
    }
    if (values.endedAt !== null) {
      addManual.mutate({ taskId, ...values, endedAt: values.endedAt }, close);
    }
  });

  const parsedSeconds = parseDuration(durationText);
  const durationHint = (() => {
    if (parsedSeconds !== null && date != null) {
      const range = quickRange({ date, durationSeconds: parsedSeconds, now: Date.now() });
      return (
        <span>
          <span className="font-mono tabular-nums text-foreground">= {formatDuration(parsedSeconds)}</span>
          <span className="font-mono tabular-nums">
            {" "}
            · {clockTime(range.startedAt)}–{clockTime(range.endedAt)}
          </span>
        </span>
      );
    }
    if (durationText.trim()) {
      return <span className="text-destructive">{DURATION_MESSAGE}</span>;
    }
    return "e.g. 1:30, 1,5t, 90m or 1h 30m";
  })();

  const rangeSeconds = Math.round((endedAt - startedAt) / 1000);
  const rangeInvalid = !(rangeSeconds > 0);

  const description = running
    ? "This timer is still running. You can move its start or change the note."
    : entry
      ? "Duration is calculated from start and end."
      : "Log time you didn't catch with the timer.";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{entry ? "Edit time entry" : "Add time"}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          {mode === "duration" ? (
            <div className="grid grid-cols-2 gap-3">
              <FormField id="entry-date" label="Date" required error={errors.date?.message}>
                <Controller
                  control={control}
                  name="date"
                  render={({ field }) => (
                    <DatePicker id="entry-date" value={field.value} onChange={field.onChange} placeholder="Pick a day" />
                  )}
                />
              </FormField>
              <FormField
                id="entry-duration"
                label="Duration"
                required
                error={errors.duration?.message}
                hint={durationHint}
              >
                {(field) => (
                  <Input
                    {...field}
                    {...register("duration")}
                    autoFocus
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="1:30 or 1,5t"
                    className="font-mono tabular-nums"
                  />
                )}
              </FormField>
            </div>
          ) : (
            <>
              <FormField id="entry-start" label="Started" required error={errors.startedAt?.message}>
                <Controller
                  control={control}
                  name="startedAt"
                  render={({ field }) => (
                    <DateTimePicker id="entry-start" value={field.value} onChange={field.onChange} />
                  )}
                />
              </FormField>
              {running ? (
                <div className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium leading-none">Ended</span>
                  <div className="flex h-9 items-center gap-2 text-sm text-ember">
                    <span className="size-1.5 animate-pulse rounded-full bg-ember" aria-hidden />
                    Still running
                  </div>
                </div>
              ) : (
                <FormField id="entry-end" label="Ended" required error={errors.endedAt?.message}>
                  <Controller
                    control={control}
                    name="endedAt"
                    render={({ field }) => (
                      <DateTimePicker id="entry-end" value={field.value} onChange={field.onChange} />
                    )}
                  />
                </FormField>
              )}
              <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm">
                <span className="text-muted-foreground">{running ? "Running for" : "Duration"}</span>
                <span className={`font-mono tabular-nums ${rangeInvalid ? "text-destructive" : ""}`}>
                  {rangeInvalid ? "—" : formatDuration(rangeSeconds)}
                </span>
              </div>
            </>
          )}

          {entry ? null : (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto self-start px-0 text-muted-foreground hover:text-foreground"
              onClick={() => switchMode(mode === "duration" ? "range" : "duration")}
            >
              {mode === "duration" ? <Clock aria-hidden /> : <Timer aria-hidden />}
              {mode === "duration" ? "Set start and end time" : "Enter a duration instead"}
            </Button>
          )}

          <FormField id="entry-note" label="Note" error={errors.description?.message}>
            {(field) => (
              <Textarea {...field} {...register("description")} rows={2} placeholder="What did you work on?" />
            )}
          </FormField>

          <DialogActions
            onCancel={() => onOpenChange(false)}
            submitLabel={entry ? "Save" : "Add time"}
            pending={edit.isPending || addManual.isPending}
          />
        </form>
      </DialogContent>
    </Dialog>
  );
};
