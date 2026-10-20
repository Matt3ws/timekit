import { useState } from "react";
import { useMutation, useQuery, type UseMutationResult, type UseQueryResult } from "@tanstack/react-query";
import { getVersion } from "@tauri-apps/api/app";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { toast } from "sonner";

/**
 * Updates from GitHub releases: the Release workflow publishes `latest.json`
 * next to the installers, signed with the updater key whose public half is in
 * `tauri.conf.json`. Checked on start and once a day (unless turned off), or
 * from Settings → Updates.
 *
 * @module
 */

const AUTO_KEY = "timekit-auto-update";
const DAY_MS = 24 * 60 * 60 * 1000;

/** The outcome of one check. Errors are kept, not thrown: an offline check shouldn't toast. */
export interface UpdateCheck {
  /** The newer release, or `null` when this is the latest version. */
  update: Update | null;
  /** Why the check failed (offline, no release yet…). */
  error: string | null;
  checkedAt: number;
}

const updateKey = ["update-check"] as const;

const readAutoCheck = (): boolean => localStorage.getItem(AUTO_KEY) !== "off";

/** Whether to check for updates on start and daily. Kept per machine. */
export const useAutoUpdateCheck = (): [boolean, (on: boolean) => void] => {
  const [on, setOn] = useState(readAutoCheck);
  const set = (next: boolean): void => {
    localStorage.setItem(AUTO_KEY, next ? "on" : "off");
    setOn(next);
  };
  return [on, set];
};

/**
 * The latest update check. Runs on its own only while automatic checks are
 * on; `refetch()` checks right away either way.
 */
export const useUpdateCheck = ({ auto }: { auto: boolean }): UseQueryResult<UpdateCheck, Error> =>
  useQuery({
    queryKey: updateKey,
    queryFn: async (): Promise<UpdateCheck> => {
      try {
        return { update: await check(), error: null, checkedAt: Date.now() };
      } catch (error) {
        return { update: null, error: String(error), checkedAt: Date.now() };
      }
    },
    enabled: auto,
    staleTime: DAY_MS,
    refetchInterval: auto ? DAY_MS : false,
    retry: false,
  });

/** This build's version, from `tauri.conf.json`. */
export const useAppVersion = (): UseQueryResult<string, Error> =>
  useQuery({ queryKey: ["app-version"], queryFn: getVersion, staleTime: Infinity });

/**
 * Downloads and installs the update, then restarts TimeKit. A running timer
 * keeps going: it lives in the database, not in the window.
 */
export const useInstallUpdate = (): UseMutationResult<void, Error, Update> =>
  useMutation({
    mutationFn: async (update: Update): Promise<void> => {
      await update.downloadAndInstall();
      await relaunch();
    },
    onError: (error): void => {
      toast.error(`Couldn't install the update: ${String(error)}`);
    },
  });
