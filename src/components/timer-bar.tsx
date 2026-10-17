import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Square } from "lucide-react";
import { Button } from "@/ui/button";
import { LiveDuration } from "@/components/live-duration";
import { customerColor } from "@/lib/customer-color";
import { useActiveTimer, useEditTimeEntry, useStopTimer } from "@/queries/use-time-entries";

/**
 * The running timer, pinned across the top of every page: what you're working
 * on, the clock, an inline note and Stop. Renders nothing while idle.
 */
export const TimerBar = (): React.JSX.Element | null => {
  const { data: active } = useActiveTimer();
  const stop = useStopTimer();
  const edit = useEditTimeEntry();
  const [note, setNote] = useState("");

  useEffect(() => {
    setNote(active?.description ?? "");
  }, [active?.id, active?.description]);

  if (!active) {
    return null;
  }

  const saveNote = (): void => {
    const next = note.trim() || null;
    if (next !== (active.description ?? null)) {
      edit.mutate({ id: active.id, startedAt: active.startedAt, endedAt: null, description: next });
    }
  };

  return (
    <div className="flex items-center gap-3 border-b border-ember-line/60 bg-gradient-to-r from-ember-soft to-ember-soft/40 px-6 py-2">
      <span className="relative flex size-2.5 shrink-0" aria-hidden>
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-ember opacity-60" />
        <span className="relative inline-flex size-2.5 rounded-full bg-ember" />
      </span>
      <Link
        to="/projects/$projectId"
        params={{ projectId: active.projectId }}
        className="min-w-0 shrink truncate text-sm hover:underline"
        title={`${active.taskTitle} · ${active.customerName} · ${active.projectTitle}`}
      >
        <span className="font-semibold">{active.taskTitle}</span>
        <span className="text-muted-foreground">
          {" · "}
          <span
            className="mr-1 inline-block size-2 rounded-full align-middle"
            style={{ background: customerColor(active.customerId) }}
          />
          {active.customerName} · {active.projectTitle}
        </span>
      </Link>
      <input
        value={note}
        onChange={(event) => setNote(event.target.value)}
        onBlur={saveNote}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }
        }}
        placeholder="What are you working on?"
        aria-label="Note for the running timer"
        className="ml-auto h-7 w-56 min-w-0 rounded-md border border-ember-line/50 bg-background/60 px-2 text-sm outline-none placeholder:text-muted-foreground focus:border-ember"
      />
      <LiveDuration
        startedAt={active.startedAt}
        className="font-mono text-lg font-semibold tabular-nums text-ember"
      />
      <Button size="sm" onClick={() => stop.mutate()} disabled={stop.isPending} className="gap-1.5">
        <Square className="size-3 fill-current" />
        Stop
      </Button>
    </div>
  );
};
