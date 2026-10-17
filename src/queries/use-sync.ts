import { useEffect } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";

/**
 * Turso sync: settings, status and pulling the other machine's changes.
 * Everything here talks to the Rust commands in `src-tauri/src/sync_config.rs`.
 *
 * @module
 */

/** `local`: sync off · `synced`: Turso reachable · `offline`: sync on, read-only copy. */
export type SyncMode = "local" | "synced" | "offline";

/** What `sync_status` returns. The auth token is never sent back to the WebView. */
export interface SyncStatus {
  mode: SyncMode;
  url: string | null;
  /** Why sync is offline, or why the database couldn't be opened. */
  message: string | null;
}

/** The Turso database to share between machines. */
export interface SyncConfigInput {
  url: string;
  authToken: string;
}

const syncKey = ["sync-status"] as const;

/** Whether this machine is local-only, synced or offline. */
export const useSyncStatus = (): UseQueryResult<SyncStatus, Error> =>
  useQuery({
    queryKey: syncKey,
    queryFn: (): Promise<SyncStatus> => invoke<SyncStatus>("sync_status"),
  });

/**
 * Checks the connection, saves the settings and switches to the shared
 * database. Every query is refetched, since all data just changed.
 */
export const useSaveSyncConfig = (): UseMutationResult<void, Error, SyncConfigInput> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ url, authToken }: SyncConfigInput): Promise<void> => {
      await invoke("save_sync_config", { url, authToken });
    },
    onSuccess: async (): Promise<void> => {
      await queryClient.invalidateQueries();
      toast.success("Sync is on");
    },
    onError: (error): void => {
      toast.error(`Couldn't turn on sync: ${String(error)}`);
    },
  });
};

/** Turns sync off and switches back to this computer's local database. */
export const useClearSyncConfig = (): UseMutationResult<void, Error, void> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<void> => {
      await invoke("clear_sync_config");
    },
    onSuccess: async (): Promise<void> => {
      await queryClient.invalidateQueries();
      toast.success("Sync is off: back on this computer's own data");
    },
    onError: (error): void => {
      toast.error(`Couldn't turn off sync: ${String(error)}`);
    },
  });
};

/** Opens the database again, to reconnect to Turso after being offline. */
export const useReconnect = (): UseMutationResult<void, Error, void> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<void> => {
      await invoke("reconnect");
    },
    onSuccess: async (): Promise<void> => {
      await queryClient.invalidateQueries();
    },
    onError: (error): void => {
      toast.error(`Couldn't reconnect: ${String(error)}`);
    },
  });
};

/**
 * While sync is on, pull the other machine's changes whenever the window
 * gets focus, then refetch everything. (The replica also pulls every 15 s on
 * its own, but cached queries wouldn't notice.)
 */
export const useSyncOnFocus = (): void => {
  const queryClient = useQueryClient();
  const { data: status } = useSyncStatus();
  const synced = status?.mode === "synced";

  useEffect(() => {
    if (!synced) {
      return undefined;
    }
    const pull = async (): Promise<void> => {
      try {
        await invoke("sync_now");
        await queryClient.invalidateQueries();
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn("[sync]", error);
      }
    };
    const onFocus = (): void => {
      void pull();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [synced, queryClient]);
};
