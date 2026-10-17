---
name: tanstack
description: Use when fetching or mutating data in components in this app — anything using `@tanstack/react-query`, `useQuery`, `useMutation`, `useQueryClient`, `queryKey`, `queryFn`, `invalidateQueries`, query stale time, or pairing TanStack Query with shadcn (skeletons, sonner toasts). In TimeKit, query/mutation functions call the local Drizzle client directly (no HTTP). Triggers on phrases like "fetch this", "add a mutation", "invalidate the cache", "loading state".
---

# TanStack Query Patterns (TimeKit)

How to use TanStack Query (`@tanstack/react-query`) in this app. **There is no backend HTTP API** — `queryFn` / `mutationFn` call the local Drizzle client (`@/db/client`) directly, which executes SQLite through the Rust `db_query` / `db_batch` commands (libsql, optionally a Turso replica). Query hooks live in `src/queries/`.

---

## Setup

`QueryClientProvider` wraps the app in `src/main.tsx`. No per-component setup needed.

Sensible global defaults:

- `staleTime: 30_000` — data stays fresh for 30s before a background refetch
- `retry: 1` — local DB calls rarely benefit from aggressive retries

---

## Fetching data — `useQuery`

```tsx
import { useQuery } from "@tanstack/react-query";
import { db } from "@/db/client";
import { projects } from "@/db/schema";

export const useProjects = (): UseQueryResult<Project[], Error> =>
  useQuery({
    queryKey: ["projects"], // unique key — used for caching + invalidation
    queryFn: (): Promise<Project[]> => db.select().from(projects),
  });
```

**`queryKey` rules:**

- Must uniquely identify the data. Include any variables the query depends on:
  ```ts
  queryKey: ["tasks", { projectId }];
  ```
- Changing the key automatically triggers a new fetch.

---

## Mutations — `useMutation`

Always wire `onError` to a `sonner` toast with a specific, per-mutation message — never a generic one. Invalidate affected query keys in `onSuccess`.

```tsx
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db } from "@/db/client";
import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";

export const useUpdateProject = (): UseMutationResult<void, Error, UpdateProjectInput> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: UpdateProjectInput): Promise<void> => {
      await db.update(projects).set({ ...patch, updatedAt: Date.now() }).where(eq(projects.id, id));
    },
    onSuccess: async (): Promise<void> => {
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Project saved");
    },
    onError: (): void => {
      toast.error("Couldn't save the project");
    },
  });
};
```

---

## Key patterns

### Loading states → shadcn `Skeleton`

```tsx
if (isLoading) return <Skeleton className="h-40 w-full" />;
```

### Pending mutations → disable + spinner

Use `isPending` from `useMutation` as the `disabled` prop on the shadcn `Button` (and show a `Loader2` spinner).

### Always invalidate after mutations

Call `queryClient.invalidateQueries` after a successful write so the UI reflects new state without a manual refresh. Invalidate **every** key the write affects (e.g. stopping a timer invalidates both `["active-timer"]` and `["tasks"]`).

### Live timer ticking

The running timer is *derived* (elapsed = `now - startedAt`), so it does **not** need a query refetch every second. Keep `["active-timer"]` query for the entry record, and tick a local `useState`/`setInterval` for the displayed clock.

---

## What NOT to use TanStack Query for

- **Form state** — that's `react-hook-form`
- **Global UI state** (open dialogs, active tab) — `useState`
- **Ephemeral derived values** (the live timer clock) — local interval, not a query

---

## Devtools

```bash
pnpm add -D @tanstack/react-query-devtools
```

```tsx
// src/main.tsx — inside QueryClientProvider
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
{import.meta.env.DEV && <ReactQueryDevtools />}
```
