---
name: typescript
description: Use when writing or editing TypeScript in this codebase — any `.ts` or `.tsx` file. Enforces project-specific style conventions: arrow functions only (no `function` keyword), options-object parameters, named interfaces over inline types, `interface` vs `type` rules, no `any`, JSDoc on exported symbols, no inline `if` bodies, `async/await` over `.then()`, template literals, explicit return types on exports, naming conventions. Load this skill BEFORE producing any TypeScript code so the style is right the first time.
---

# TypeScript Style Conventions

Conventions enforced across this codebase.

---

## Options object over positional parameters

Use a named options object when the **parameter name carries meaning** — regardless of how many parameters there are. The test is: _would a reader of the callsite know what they're passing without looking at the function definition?_

**Always use an options object when:**

- There are 2+ parameters (order ambiguity, easy to swap)
- A single parameter's name is important to understand what the value represents

**Positional is fine when:**

- The function is a trivial pure utility and the type alone is sufficient (`(ms: number)`, `(value: number)`)
- The parameter name adds nothing beyond what the type already says

**Wrong:**

```ts
const formatDuration = (hours: number, minutes: number): string => ...;
const createTimeEntry = (projectId: string, taskId: string, startTime: Date): Promise<TimeEntry> => ...;
const updateEntry = (id: string, title: string): Promise<void> => ...;
const sleep = (ms: number): Promise<void> => ...;  // name matters!
```

**Right:**

```ts
const formatDuration = ({ hours, minutes }: { hours: number; minutes: number }): string => ...;
const createTimeEntry = ({ projectId, taskId, startTime }: { projectId: string; taskId: string; startTime: Date }): Promise<TimeEntry> => ...;
const updateEntry = ({ id, title }: { id: string; title: string }): Promise<void> => ...;
const sleep = (ms: number): Promise<void> => ...;  // trivial pure function
```

**Why:**

Positional arguments are opaque at the callsite — the parameter name only exists in the definition:

```ts
formatDuration(8, 30); // what are these numbers?
createTimeEntry("abc", "def", now); // order matters — easy to swap
updateEntry(id, "New Title"); // what is the string?
sleep(500); // clear intent from type alone ✓
```

Named object params are self-documenting and refactor-safe:

```ts
formatDuration({ hours: 8, minutes: 30 });
createTimeEntry({ projectId: "abc", taskId: "def", startTime: now });
updateEntry({ id, title: "New Title" });
sleep(500);
```

---

## Inline types vs named interfaces

Always extract a named interface for options objects — even if used in only one place. The only exception is a **single-property object** where the type is self-evident from the function name alone.

**Wrong — inline multi-prop object:**

```ts
const toCopenhagenISO = ({ dateStr, timeStr }: { dateStr: string; timeStr: string }): string => ...;
const createEntry = ({ projectId, taskId, startTime }: { projectId: string; taskId: string; startTime: Date }): Promise<TimeEntry> => ...;
```

**Right — named interface:**

```ts
interface ToCopenhagenISOInput {
  dateStr: string;
  timeStr: string;
}

const toCopenhagenISO = ({ dateStr, timeStr }: ToCopenhagenISOInput): string => ...;

interface CreateEntryInput {
  projectId: string;
  taskId?: string;
  startTime: Date;
}

const createEntry = ({ projectId, taskId, startTime }: CreateEntryInput): Promise<TimeEntry> => ...;
```

**Fine as inline — single prop, self-evident:**

```ts
const getEntries = ({ date }: { date: string }): Promise<TimeEntry[]> => ...;
const formatDuration = (ms: number): string => ...;
```

**Why:** Named interfaces are self-documenting at the callsite, show up in IDE autocomplete, and are easy to extend without touching the function signature.

---

## `type` vs `interface`

Use `interface` for **object shapes** (models, API contracts, component props, IPC handlers). Use `type` for everything else.

**Use `interface` when:**

- Describing the shape of an object (database record, API response, component props)
- Defining a public API contract or IPC handler signature
- Declaring a data model used in 2+ places

```ts
interface TimeEntry {
  id: string;
  projectId: string;
  title: string;
  startedAt: Date;
  stoppedAt?: Date;
}

interface MyComponentProps {
  entries: TimeEntry[];
  onSelect: (entry: TimeEntry) => void;
}

interface TimerService {
  startTimer: (payload: {
    projectId: string;
    taskId?: string;
  }) => Promise<void>;
  stopTimer: () => Promise<void>;
}
```

**Use `type` when:**

- Creating a union or intersection
- Aliasing a primitive, tuple, or function signature
- Deriving a type from another (`z.infer`, `Awaited`, `ReturnType`, `Extract`, etc.)
- Creating a type-level utility

```ts
type TimeUnit = "hours" | "minutes" | "seconds";
type MaybeNull<T> = T | null;
type Handler = (entry: TimeEntry) => Promise<void>;
type FormValues = z.infer<typeof createEntrySchema>;
type AuthTokens = Awaited<ReturnType<typeof window.api.auth.getTokens>>;
```

**Never re-declare with `interface` what is naturally a union, alias, or utility type — use `type` there.**

---

## Avoid `any` — use `unknown` and narrow

Never use `any` except for poorly-typed external libraries (and document why).

```ts
// Wrong
const parseEntry = (data: any) => data.id;

// Right
const parseEntry = (data: unknown): string => {
  if (
    typeof data === "object" &&
    data !== null &&
    "id" in data &&
    typeof data.id === "string"
  ) {
    return data.id;
  }
  throw new Error("Invalid entry data");
};
```

**The only acceptable use of `any`** is when interacting with untyped external library responses:

```ts
// OK — document why
const response = (await someUnstableLibrary.fetch()) as any;
const tokenExpiry = response.expires_in as number; // poorly-typed third-party API
```

---

## `as const` for static config objects

Use `as const` to narrow types and prevent accidental mutation of config:

```ts
// Prefer — narrows types and prevents modification
export const THEME = {
  COLORS: {
    PRIMARY: "#3B82F6",
    SUCCESS: "#10B981",
    ERROR: "#EF4444",
  },
  BREAKPOINTS: {
    MOBILE: 480,
    TABLET: 768,
    DESKTOP: 1024,
  },
} as const;

// Usage — TS knows these are specific values, not just strings
const backgroundColor: typeof THEME.COLORS.PRIMARY = THEME.COLORS.PRIMARY; // ✓
```

---

## JSDoc on all exported symbols

Every exported function, class, interface, and constant must have a `/** … */` JSDoc comment. Internal helpers only need one when the intent isn't immediately obvious from the code.

**Minimum — a one-line description:**

```ts
/** Returns true if the timer is currently running. */
export const isTimerRunning = (): boolean => ...;

/** Formats milliseconds into HH:MM:SS format. */
export const formatElapsedTime = (ms: number): string => ...;
```

**Full format for anything non-trivial:**

```ts
/**
 * Starts a live timer for the given project and task.
 *
 * Creates a new time entry with `started_at` set to now, starts the timer,
 * and broadcasts the timer tick event every 1000ms. Only one timer can run
 * at a time; calling this while a timer is active will stop the previous one.
 *
 * @param projectId - ID of the project to track time on.
 * @param taskId - Optional task ID. If not provided, defaults to the project's auto-track task.
 * @returns The ID of the newly created time entry.
 * @throws {Error} If the project has no trackable tasks.
 *
 * @example
 * const entryId = await startLiveTimer({ projectId: 'proj_123', taskId: 'task_456' });
 * // Timer now running, will emit 'timer:tick' events every second
 */
export const startLiveTimer = async ({ projectId, taskId }: { projectId: string; taskId?: string }): Promise<string> => ...;
```

**Tags to use:**

| Tag                          | Use                                                                |
| ---------------------------- | ------------------------------------------------------------------ |
| `@param name - desc`         | Document each parameter (skip the `{type}` — TypeScript owns that) |
| `@returns desc`              | Describe the return value when it isn't obvious                    |
| `@throws {ErrorClass} desc`  | Document thrown errors callers must handle                         |
| `@example`                   | Show a realistic callsite snippet                                  |
| `@module`                    | Top of file — describe the module's purpose                        |
| `@deprecated desc`           | Mark functions as deprecated with replacement instructions         |
| `@see` / `{@link OtherFunc}` | Cross-reference related symbols                                    |

**What NOT to document** — don't restate the TypeScript signature:

```ts
// Wrong — adds noise, zero information gain
/**
 * @param value {number} a number
 * @returns {string} a formatted string
 */
export const formatDuration = (value: number): string => ...;

// Right — TypeScript already says it's number → string; say *what* it means
/** Formats milliseconds as HH:MM:SS. @example formatDuration(3661000) // "01:01:01" */
export const formatDuration = (value: number): string => ...;
```

---

## No inline `if` bodies — always use braces

Never write a `return`, `throw`, or any statement inline on the same line as an `if`. Always use a block.

**Wrong:**

```ts
if (!response.ok) throw new Error("Request failed");
if (entry.stoppedAt) return calculateDuration(entry);
if (!projectId) return null;
```

**Right:**

```ts
if (!response.ok) {
  throw new Error("Request failed");
}
if (entry.stoppedAt) {
  return calculateDuration(entry);
}
if (!projectId) {
  return null;
}
```

---

## Arrow functions over `function` declarations

Always use arrow functions. Never use the `function` keyword (except for named function expressions when truly necessary, which is rare).

**Wrong:**

```ts
function formatMoney(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export function getTimeEntries({ projectId }: { projectId: string }) {
  return ipc.invoke('time-entries:list', { projectId });
}

const handler = {
  async process(job: Job) { ... },
};

export default function TimeTrackingPage() { ... }
```

**Right:**

```ts
const formatMoney = (value: number): string =>
  value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export const getTimeEntries = ({ projectId }: { projectId: string }) =>
  ipc.invoke('time-entries:list', { projectId });

const handler = {
  process: async (job: Job) => { ... },
};

const TimeTrackingPage = () => { ... };
export default TimeTrackingPage;
```

**React components** — same rule:

```ts
// Wrong
export default function SettingsPage() { ... }
export function TimerDisplay({ elapsed }: Props) { ... }

// Right
const SettingsPage = () => { ... };
export default SettingsPage;

export const TimerDisplay = ({ elapsed }: Props) => { ... };
```

**Why:** Consistency, no hoisting surprises, and arrow functions make the `this`-binding explicit.

---

## `async/await` over `.then()` chains

Always use `async/await`. Never chain `.then()`.

**Wrong:**

```ts
const fetchEntries = ({ projectId }: { projectId: string }) =>
  ipc.invoke("time-entries:list", { projectId }).then((res) => res);

const createAndNotify = ({ title }: { title: string }) =>
  ipc.invoke("time-entries:create", { title }).then((entry) => {
    toast.success("Entry created");
    return entry;
  });
```

**Right:**

```ts
const fetchEntries = async ({ projectId }: { projectId: string }) => {
  const res = await ipc.invoke("time-entries:list", { projectId });
  return res;
};

const createAndNotify = async ({ title }: { title: string }) => {
  const entry = await ipc.invoke("time-entries:create", { title });
  toast.success("Entry created");
  return entry;
};
```

**Why:** `async/await` is easier to read, easier to debug (stack traces include the `await` site), and easier to extend (adding error handling or a second `await` doesn't require restructuring the chain).

---

## Optional chaining and nullish coalescing

Use optional chaining (`?.`) and nullish coalescing (`??`) to handle undefined/null safely:

```ts
// Optional chaining — stops if any level is null/undefined
const taskName = entry?.task?.name;

// Nullish coalescing — provide default for null/undefined
const duration = entry.duration ?? 0;

// Combine them
const status = entry?.status?.code ?? "unknown";

// Not for falsy values — use short-circuit instead
const title = entry?.title || "Untitled"; // ✓ Show "Untitled" even if title is ""
const title = entry?.title ?? "Untitled"; // ✗ Would show "" if title is empty string
```

---

## Template literals over string concatenation

Always use template literals (backticks). Never concatenate strings with `+`.

**Wrong:**

```ts
const message = "Timer stopped after " + formatDuration(elapsed) + " minutes";
const url = baseUrl + "/api/entries/" + entryId + "?format=json";
```

**Right:**

```ts
const message = `Timer stopped after ${formatDuration(elapsed)} minutes`;
const url = `${baseUrl}/api/entries/${entryId}?format=json`;
```

---

## Null vs undefined

- **Use `undefined`** for missing/optional values (function return, object property)
- **Use `null`** only when explicitly representing "no value" (rare in this codebase)

```ts
// Prefer undefined
interface TimeEntry {
  id: string;
  taskId?: string;  // undefined when not set
  stoppedAt?: Date; // undefined if timer still running
}

const getValue = (): string | undefined => ...;

// OK to use null sparingly
const value = data.field === null ? null : transform(data.field);
```

---

## Exhaustiveness checking for unions

When handling discriminated unions, ensure all branches are covered:

```ts
type Action =
  | { type: "START_TIMER"; projectId: string }
  | { type: "STOP_TIMER" }
  | { type: "UPDATE_ENTRY"; entryId: string; title: string };

const handleAction = (action: Action): void => {
  switch (action.type) {
    case "START_TIMER": {
      // ...
      break;
    }
    case "STOP_TIMER": {
      // ...
      break;
    }
    case "UPDATE_ENTRY": {
      // ...
      break;
    }
    default: {
      // TypeScript will error if a case is missing
      const _exhaustive: never = action;
      throw new Error(`Unhandled action: ${_exhaustive}`);
    }
  }
};
```

---

## Naming conventions

**Constants (SCREAMING_SNAKE_CASE):**

```ts
const MAX_TIMER_DURATION_MS = 12 * 60 * 60 * 1000;
const DEFAULT_SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const PRODUCTIVE_PROJECT_ID = "proj_auto_track";
```

**Functions and variables (camelCase):**

```ts
const getTimeEntries = async (...) => ...;
const isTimerActive = true;
const formatElapsedTime = (ms: number) => ...;
```

**Types and interfaces (PascalCase):**

```ts
interface TimeEntry { ... }
type TimerStatus = 'running' | 'stopped' | 'paused';
```

**Files:**

- **Components:** `ComponentName.tsx` (PascalCase)
- **Hooks:** `useHookName.ts` (camelCase with `use` prefix)
- **Utilities:** `helperName.ts` (camelCase)
- **Styles:** `styles.css` (kebab-case for class names)

---

## Explicit return types

Always declare return types explicitly on exported functions. Internal helpers are fine without them if the inferred type is obvious.

```ts
// Exported — always explicit
export const getUser = async (): Promise<User> => ...;
export const calculateDuration = (start: Date, end: Date): number => ...;

// Internal — OK without explicit type
const getDayName = (date: Date) => date.toLocaleDateString('en-US', { weekday: 'long' });
```

---

## Error classes

Create custom error classes for domain-specific errors:

```ts
export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthenticationError";
  }
}

export class TimeEntryNotFoundError extends Error {
  constructor(id: string) {
    super(`Time entry ${id} not found`);
    this.name = "TimeEntryNotFoundError";
  }
}

// Usage
try {
  await fetchEntry(id);
} catch (err) {
  if (err instanceof TimeEntryNotFoundError) {
    toast.error("Entry was deleted");
  } else {
    toast.error("Failed to fetch entry");
  }
}
```
