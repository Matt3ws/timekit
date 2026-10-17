import { useState } from "react";
import { CloudOff, Loader2, RefreshCw } from "lucide-react";
import { FormField } from "@/components/form-field";
import { Button } from "@/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/card";
import { Input } from "@/ui/input";
import { Skeleton } from "@/ui/skeleton";
import { cn } from "@/lib/utils";
import { useClearSyncConfig, useReconnect, useSaveSyncConfig, useSyncStatus, type SyncMode } from "@/queries/use-sync";

const MODE_LABEL: Record<SyncMode, string> = {
  local: "Local only: data stays on this computer",
  synced: "Synced with Turso",
  offline: "Offline: you can look things up, but not change anything",
};

const MODE_DOT: Record<SyncMode, string> = {
  local: "bg-muted-foreground",
  synced: "bg-success",
  offline: "bg-ember",
};

interface SyncErrors {
  url?: string;
  authToken?: string;
}

const validate = ({ url, authToken }: { url: string; authToken: string }): SyncErrors => {
  const errors: SyncErrors = {};
  if (!/^(libsql|https):\/\/\S+$/.test(url.trim())) {
    errors.url = "Paste the database URL from Turso, starting with libsql://";
  }
  if (!authToken.trim()) {
    errors.authToken = "Paste a token created for this database";
  }
  return errors;
};

/**
 * Share one database between machines through Turso. Not part of the settings
 * form: the URL and token live outside the database, and saving switches databases at once.
 */
export const SyncCard = (): React.JSX.Element => {
  const { data: status, isLoading } = useSyncStatus();
  const save = useSaveSyncConfig();
  const clear = useClearSyncConfig();
  const reconnect = useReconnect();
  const [url, setUrl] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [errors, setErrors] = useState<SyncErrors>({});
  const busy = save.isPending || clear.isPending || reconnect.isPending;

  const turnOn = (): void => {
    const found = validate({ url, authToken });
    setErrors(found);
    if (!found.url && !found.authToken) {
      save.mutate({ url: url.trim(), authToken: authToken.trim() });
    }
  };

  if (isLoading || !status) {
    return <Skeleton className="h-48 w-full" />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sync</CardTitle>
        <CardDescription>
          Use the same data on your Mac and PC through a free Turso database. Changes need an internet connection;
          looking things up works offline.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-2 text-sm">
          <span className={cn("size-2 shrink-0 rounded-full", MODE_DOT[status.mode])} aria-hidden />
          <span>{MODE_LABEL[status.mode]}</span>
        </div>
        {status.message && (
          <p className="flex items-start gap-2 rounded-md bg-ember-soft px-3 py-2 text-[13px] text-ember">
            <CloudOff className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>{status.message}</span>
          </p>
        )}

        {status.mode === "local" ? (
          <>
            <FormField
              id="sync-url"
              label="Database URL"
              error={errors.url}
              hint="In Turso: your database → Connect. Looks like libsql://timekit-yourname.turso.io"
            >
              {(control) => (
                <Input
                  {...control}
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="libsql://…"
                  className="font-mono text-[13px]"
                  autoComplete="off"
                  spellCheck={false}
                />
              )}
            </FormField>
            <FormField
              id="sync-token"
              label="Auth token"
              error={errors.authToken}
              hint="Kept in a file on this computer, never in the shared database."
            >
              {(control) => (
                <Input
                  {...control}
                  type="password"
                  value={authToken}
                  onChange={(event) => setAuthToken(event.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
              )}
            </FormField>
            <p className="text-[13px] text-muted-foreground">
              Turning sync on switches to the Turso database. The data on this computer is not uploaded; it comes back if
              you turn sync off.
            </p>
            <div className="flex justify-end">
              <Button type="button" onClick={turnOn} disabled={busy}>
                {save.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
                Connect
              </Button>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate font-mono text-[13px] text-muted-foreground" title={status.url ?? undefined}>
              {status.url}
            </span>
            <div className="flex shrink-0 gap-2">
              {status.mode === "offline" && (
                <Button type="button" variant="outline" onClick={() => reconnect.mutate()} disabled={busy}>
                  <RefreshCw className={cn("size-4", reconnect.isPending && "animate-spin")} aria-hidden />
                  Try again
                </Button>
              )}
              <Button type="button" variant="outline" onClick={() => clear.mutate()} disabled={busy}>
                {clear.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
                Turn off sync
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
