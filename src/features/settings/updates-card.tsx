import { formatDistanceToNow } from "date-fns";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/card";
import { Label } from "@/ui/label";
import { Switch } from "@/ui/switch";
import { cn } from "@/lib/utils";
import { useAppVersion, useAutoUpdateCheck, useInstallUpdate, useUpdateCheck } from "@/queries/use-updates";

/**
 * The installed version, checking GitHub for a newer release and installing
 * it. Not part of the settings form: the switch is per machine and saves at once.
 */
export const UpdatesCard = (): React.JSX.Element => {
  const [auto, setAuto] = useAutoUpdateCheck();
  const { data: version } = useAppVersion();
  const { data: result, refetch, isFetching } = useUpdateCheck({ auto });
  const install = useInstallUpdate();
  const update = result?.update ?? null;

  const status = ((): { text: string; dot: string } => {
    if (update) {
      return { text: `TimeKit ${update.version} is available`, dot: "bg-ember" };
    }
    if (result?.error) {
      return { text: `Couldn't check for updates: ${result.error}`, dot: "bg-muted-foreground" };
    }
    if (result) {
      return { text: "You have the latest version", dot: "bg-success" };
    }
    return { text: "Not checked yet", dot: "bg-muted-foreground" };
  })();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Updates</CardTitle>
        <CardDescription>
          New versions come from TimeKit's GitHub releases. Installing one restarts TimeKit; a running timer keeps
          going.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 text-sm">
            <div className="flex items-center gap-2">
              <span className={cn("size-2 shrink-0 rounded-full", status.dot)} aria-hidden />
              <span className="truncate" title={status.text}>
                {status.text}
              </span>
            </div>
            <div className="mt-0.5 pl-4 text-xs text-muted-foreground">
              Installed: <span className="font-mono tabular-nums">{version ?? "…"}</span>
              {result && <> · checked {formatDistanceToNow(result.checkedAt, { addSuffix: true })}</>}
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            {update ? (
              <Button type="button" onClick={() => install.mutate(update)} disabled={install.isPending}>
                {install.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
                Install and restart
              </Button>
            ) : (
              <Button type="button" variant="outline" onClick={() => void refetch()} disabled={isFetching}>
                <RefreshCw className={cn("size-4", isFetching && "animate-spin")} aria-hidden />
                Check now
              </Button>
            )}
          </div>
        </div>
        {update?.body && (
          <div className="whitespace-pre-line rounded-md bg-foreground/[0.04] px-3 py-2 text-[13px] text-muted-foreground dark:bg-foreground/[0.06]">
            {update.body}
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="auto-update" className="font-normal">
            Check for updates automatically
            <span className="block text-xs text-muted-foreground">When TimeKit starts, and once a day.</span>
          </Label>
          <Switch id="auto-update" checked={auto} onCheckedChange={setAuto} />
        </div>
      </CardContent>
    </Card>
  );
};
