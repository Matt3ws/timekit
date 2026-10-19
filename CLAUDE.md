# Claude Instructions — TimeKit

## Project Overview

**TimeKit** is a fully-offline **macOS desktop app** for freelance/agency time tracking and invoicing. Manage **customers → projects → tasks**, run a **start/stop timer** on tasks, and generate **PDF invoices**.

**This is NOT a Shopify app.** It is a standalone desktop app.

Stack: **Tauri 2** (Rust shell: database layer + plugins) + **React 19 / TypeScript** + **Vite** frontend · **SQLite** via **Drizzle ORM** (`sqlite-proxy` driver over **libsql** in Rust; optional **Turso** sync) · **TanStack Query + Router** · **shadcn/ui** + **Tailwind v4** · **@react-pdf/renderer** for invoices.

The full design lives in [.claude/plans/time-tracker-invoicing-app.html](.claude/plans/time-tracker-invoicing-app.html) — read it first.

## Key Paths

- `src/db/schema.ts` — **Drizzle schema** (customers, projects, tasks, time_entries, invoices, invoice_line_items, invoice_entries, task_links, settings)
- `src/db/client.ts` — Drizzle client wired to the Rust `db_query` / `db_batch` commands via the `sqlite-proxy` driver; `db.batch()` = one real transaction
- `src-tauri/migrations/` — **hand-written** SQL migrations, registered in `src-tauri/src/migrate.rs` (file `000N_*.sql` = version N+1; applied versions live in `_sqlx_migrations`, the old plugin's table). Don't run `pnpm db:generate`: the drizzle-kit snapshot only knows migration 0000 and would regenerate existing tables
- `src-tauri/src/db.rs` — the database (libsql): local `timekit.db`, or with sync on a Turso embedded replica `timekit-sync.db` (reads local, writes go to Turso; read-only when offline). Commands `db_query`, `db_batch` (one transaction), `db_backup` (schema + rows copy). One connection behind a mutex
- `src-tauri/src/sync_config.rs` — Turso URL/token in `sync.json` (app config dir, never in the DB); `save_sync_config` / `clear_sync_config` / `reconnect` reopen the database in place; `sync_status`, `sync_now`
- `src/queries/use-sync.ts` + `src/features/settings/sync-card.tsx` — Settings → Sync; `useSyncOnFocus` pulls and refetches on window focus
- `src/queries/` — **TanStack Query hooks** (the only place that talks to the DB from the UI)
- `src/queries/keys.ts` — query key prefixes + `invalidateTimeData` / `invalidateBilling` / `invalidateNames`
- `src/features/<domain>/` — one folder per domain (customers, projects, tasks, timer, invoices, settings): pages + components
- `src/lib/` — `money.ts`, `duration.ts`, `billing.ts`, `ids.ts` (pure helpers, unit-tested with vitest: `pnpm test`)
- `src/features/invoices/invoice-document.tsx` — @react-pdf/renderer invoice/credit-note template (Danish/English via `lib/invoice-i18n.ts`)
- `src/features/invoices/save-invoice-pdf.tsx` — renders PDFs (react-pdf is **imported on demand**; keep it out of static imports) + save as / reveal
- `src/features/invoices/use-invoice-pdf.ts` — `useInvoicePdf()`: open / saveAs / reveal any invoice's PDF (always regenerated)
- `src/features/invoices/builder/` — the two-step invoice builder (select → review with live preview); `draft.ts` mirrors the lines `useCreateInvoice` builds
- `src/ui/` — shadcn components (owned source, added via the CLI: `components.json` points `ui` at `@/ui`). They must import `cn` from `@/lib/utils` — the CLI once rewrote it to an npm package called `cn`; check after every `shadcn add`
- `src/components/` — app-wide pieces: `timer-bar`, `live-duration` (ticking clock that re-renders only itself), `stat-card`, `status-chip`, `customer-dot`, `form-field`, `list-table`, `empty-state`
- `src/features/forms/fields.ts` — shared zod field schemas (amounts, percent, hours) built on the `lib/money` parsers
- `src-tauri/` — Tauri config, Cargo deps, plugin + migration registration
- `src-tauri/app-icon.svg` — the app icon source; `pnpm tauri icon src-tauri/app-icon.svg` regenerates `src-tauri/icons/` (delete the `android/` and `ios/` folders it adds). After an icon change run `cargo clean -p timekit` in `src-tauri/`, or the Windows exe keeps its old embedded icon
- `.claude/plans/` — HTML implementation plans (the `plan` skill)
- `.claude/handovers/` — HTML session handovers (the `handover` skill)
- `.claude/tasks/lessons.md` — self-improvement log

---

## Skills

Project-local skills live under `.claude/skills/`. They auto-trigger from their descriptions — invoke the relevant one **before** writing code in that area.

| Skill | Triggers on |
| --- | --- |
| `typescript` | Any `.ts`/`.tsx` — arrow functions, options objects, named interfaces, explicit return types on exports, no `any`, JSDoc on exports |
| `tanstack` | `useQuery`/`useMutation`, query keys, invalidation, loading states (queryFn calls Drizzle directly — no HTTP) |
| `plan` | "make a plan", "spec this out", "explore options" — writes `.claude/plans/<slug>.html` and opens it |
| `handover` | "wrap this up", "write up what we did", "handoff" — writes `.claude/handovers/<slug>.html` and opens it |

---

## Conventions

### Data access

- **All DB access goes through Drizzle** (`@/db/client`) — never raw SQL strings in feature code.
- **The UI only touches the DB through TanStack Query hooks** in `src/queries/`. Components never import `db` directly.
- After a mutation, call the matching helper from `queries/keys.ts` (`invalidateTimeData` for anything touching tracked time, `invalidateBilling` for invoices, `invalidateNames` for renames) rather than hand-picking keys.
- **Multi-step writes use `db.batch([...])`** (one transaction). Never chain separate `await db.insert(...)` calls for one logical change.

### Money & time

- **Money is stored as integer minor units** (øre/cents). Never store floats. Format at the display edge via `lib/money.ts`.
- **Durations**: tracked time in **seconds** (`durationSeconds`), estimates in **minutes** (`estimatedMinutes`) — the unit is always in the column name.
- **Timestamps** are integer epoch milliseconds (`...At` columns).
- **Effective hourly rate** = `project.hourlyRate ?? settings.defaultHourlyRate`. **Effective currency** = `project.currency ?? settings.currency` (default `DKK`).
- **Rates include moms** (VAT-inclusive): totals extract moms from the sum (`computeTotals`).

### Billing

- **Billed per time entry.** An invoice claims stopped entries via `invoice_entries` (`UNIQUE(time_entry_id)`); "unbilled" = stopped and not in `invoice_entries`. Time added later to an invoiced task is billed on the next invoice.
- **One line per task**, the task's claimed entries summed and **rounded up to 15 min** (`billableHours`). Any "billable/unbilled" figure must round per task too (`unbilledAmount`), never the project total once.
- **Billed entries are locked** (no edit/delete; FK `RESTRICT` also blocks deleting their task/project).
- **Invoice numbers: one series per customer** (so a number never reveals how many customers/invoices there are): `settings.invoiceNumberPrefix` + `customer.invoiceCode` + the customer's zero-padded `invoiceNumberNext`, e.g. `Cc-FIN-00001` (`formatInvoiceNumber`). The code is suggested on the first invoice (`suggestInvoiceCode`) and is unique case-insensitively, which keeps numbers unique across series (Danish rules allow several series; every number must be unique). The counter is incremented in the same batch that issues the invoice and can only move forward. `settings.invoice_number_next` (migration v6) is unused.
- **Invoice language** is per customer (`customer.invoiceLanguage`: `da` | `en`).

### Invoices

- **Issued invoices are never deleted** (Danish rules): cancel with a credit note (`useCreditInvoice`) — next number in the customer's series, negated lines, original → `credited`, its `invoice_entries` released.
- New invoices are issued as `sent`; "overdue" is displayed for sent invoices past their due date (not stored).
- `invoices.seller_json` freezes the seller's details at issue; the PDF uses it (`sellerForInvoice`), falling back to current settings only for old invoices.
- Line edits and hand-added lines go through `applyLineEdits` for both the preview and the issued invoice. The PDF shows **net** unit prices/amounts (`netAmount`); `computeTotals` sums per-line nets so they add up exactly.

### Time entries

- Running timer = `endedAt IS NULL`. At most **one** running entry at a time (enforced by the `time_entries_one_running` partial unique index; start/resume = stop + insert in one `db.batch`).
- Entries are **fully editable after stop** (start/end/description); `durationSeconds` recomputes from start/end.
- **Resume** = insert a *new* entry on the same task, copying description, with `resumedFromId` pointing at the chain **root**.

### UI

- Build the UI from **prebuilt shadcn components** (latest). Add with `pnpm dlx shadcn@latest add <name>`. Minimal custom CSS.
- **Design language: paper + ember.** Warm neutral palette (tokens in `index.css`); **ember** (`bg-ember`, `text-ember`, `ember-soft`, `ember-line`) is the ONE strong accent — only for running time and the primary money action. Status tints: `success`, `info`, `plum` (+ `-soft`). Every customer has a colour (`customerColor(id)`). All numbers use `font-mono tabular-nums`; small section labels use `.label-caps`.
- **Modals all share one size**, set once in `DialogContent` (`src/ui/dialog.tsx`): `sm:max-w-3xl`, `max-h-[88vh]`, scrolls inside. Never pass a width, max-height or overflow class to `DialogContent` in a feature; a new modal gets the shared size automatically. The only exception is the invoice builder's review step (`sm:max-w-6xl`, it shows the PDF side by side).
- Toasts via `sonner`. Loading via `Skeleton`. Forms via `react-hook-form` + `zod` with `FormField` (inline errors, labels linked with `htmlFor`).

### Naming & style

- Follow the `typescript` skill: arrow functions only, options-object params, named interfaces, explicit return types on exported functions, no `any`, JSDoc on exported symbols.

---

## Workflow

- **Plan first** for non-trivial work (3+ steps) — invoke the `plan` skill.
- **Verify before done** — run `pnpm typecheck` after changes; boot with `pnpm tauri dev` for behavior changes.
- **Wrap up** non-trivial sessions with the `handover` skill.
- **After any user correction** → add the pattern to `.claude/tasks/lessons.md`.
- Use subagents liberally for research/exploration to keep context clean.

---

## Commands

- `pnpm tauri dev` — run the desktop app (Vite + Tauri)
- `pnpm dev` — Vite frontend only (browser, no Tauri APIs)
- `pnpm typecheck` — `tsc --noEmit`
- `pnpm test` — vitest (lib/ unit tests)
- `pnpm tauri build` — production `.app` / `.dmg`
- `pnpm bump <x.y.z>` — set the version in package.json, tauri.conf.json, Cargo.toml and Cargo.lock, then add `## <x.y.z>` to `CHANGELOG.md`. Merging a bump to `main` publishes a signed release (`.github/workflows/release.yml`, see README → Releasing). `pnpm version:check` (run in CI) fails if the versions disagree or the changelog section is missing

> Requires the Rust toolchain (`cargo`/`rustc`) on PATH for any `tauri` command.

### Windows

The app also runs on Windows (needs Visual Studio C++ Build Tools + WebView2). The macOS window chrome (transparent window, vibrancy, overlay title bar) is swapped out there: `src-tauri/tauri.windows.conf.json` replaces the window with a plain opaque one, and `initPlatform()` (`src/lib/platform.ts`) tags `<html>` with `platform-windows` so `index.css` gives the body a solid background and shrinks the drag-region spacers. Keep both sides working when touching the window or sidebar chrome. `pnpm tauri build` produces `.msi`/`.exe` installers on Windows. With Windows Smart App Control on, freshly compiled release build helpers get blocked at random (`os error 4551`, or "can't find crate" for a proc-macro); `pnpm tauri build --debug --bundles nsis` reuses the already-allowed dev artifacts and gives a working installer (`src-tauri/target/debug/bundle/nsis/`). `main.rs` hides the console for every bundled build via `cfg(dev)`. Opening the database runs on a runtime worker in `setup()`: the main thread's 1 MB stack on Windows overflows on the Turso replica future. **Taskbar icon:** Explorer can't read the icon out of the unsigned exe under Smart App Control, so `taskbar_icon.rs` sets `ICON_BIG` on the window and gives the process its own AppUserModelID (`TimeKit.App`, so the taskbar uses the window's icon even when started from a shortcut), and `src-tauri/windows/hooks.nsh` (+ `icon.ico` as a Windows-only resource in `tauri.windows.conf.json`) recreates the Start menu/desktop shortcuts with that `.ico` as their icon.

### Sync (Turso)

Optional, set in Settings → Sync. Every machine writes to the same Turso primary (libsql embedded replica), so there are no merge conflicts and invoice numbers stay unique; writes need internet, reads don't. Known gap: expense **receipt files** live in the app data folder and do **not** sync (only the `receipt_path` does). Nothing local is uploaded when sync is turned on; the local `timekit.db` stays untouched and comes back when sync is turned off.
