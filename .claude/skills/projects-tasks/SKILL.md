---
name: projects-tasks
description: Use when creating, adding, editing, or seeding TimeKit projects or tasks on the user's behalf (e.g. "create a project for X", "add these tasks", "make a project from this email"). The app has no prompt-driven create path, so write directly to the local SQLite DB. Also enforces content rules — most importantly, NEVER use em-dashes in any title or description.
---

# Creating & editing projects and tasks

TimeKit normally creates projects/tasks through its UI. When the user asks the agent to create or edit them, write **directly to the SQLite database** with a small Python script.

## Content rules (apply to every title and description)

- **No em-dashes (`—`) ever.** Use a hyphen `-`, a colon, or rewrite the sentence. This is a hard rule — the user dislikes them. (Same goes for en-dashes `–`.)
- **Match the customer's language** when known (e.g. the customer "Finicc" corresponds in Danish), otherwise use the language of the user's request.
- Put the **full detail in the task description** — descriptions render on the invoice PDF, grouped under the project name, smaller text beneath the task title.

## Database

Path (macOS): `~/Library/Application Support/com.christiantangchristensen.timekit/timekit.db`
(`com.christiantangchristensen.timekit` is the bundle identifier from `src-tauri/tauri.conf.json`.)

Use **Python's `sqlite3`** with parameterized queries — it handles Danish characters and apostrophes (e.g. `'KOMPLET MED'`) safely. Never string-build SQL with user text.

## Schema essentials

`projects`: `id`, `customer_id` (FK), `title`, `description?`, `status` (`draft|active|on_hold|completed|archived`, default `draft`), `start_date?`, `end_date?`, `billing_type` (`hourly|fixed`, default `hourly`), `hourly_rate?`, `fixed_price?`, `estimated_minutes?`, `currency?`, `created_at`, `updated_at`.

`tasks`: `id`, `project_id` (FK), `title`, `description?`, `status` (`backlog|todo|in_progress|done`, default `todo`), `position` (0..n in display order), `completed_at?`, `created_at`, `updated_at`.

- **id**: any unique text — `secrets.token_hex(12)` is fine (the app uses cuid2, but format is not enforced).
- **timestamps**: integer epoch **milliseconds** — `int(time.time() * 1000)`.
- **Do NOT set `billed_at`** — a project's billed state is derived from its invoices.
- **Do NOT create invoices via the DB** — invoice numbering/sequence is handled in-app.

## Sensible defaults

- New project: `status='active'` if work is greenlit/starting, else `'draft'`; `billing_type='hourly'`; leave `hourly_rate`/`currency` null to inherit Settings.
- New task: `status='todo'`; set `position` in the order given.

## Template

```python
import sqlite3, secrets, time, os
db = os.path.expanduser("~/Library/Application Support/com.christiantangchristensen.timekit/timekit.db")
cid = lambda: secrets.token_hex(12)
now = int(time.time() * 1000)
con = sqlite3.connect(db); cur = con.cursor()

# Resolve the customer (by email/company, or assert there's exactly one)
customer_id = cur.execute("SELECT id FROM customers WHERE email = ?", ("john@finicc.com",)).fetchone()[0]

pid = cid()
cur.execute(
    """INSERT INTO projects (id, customer_id, title, description, status, billing_type, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'active', 'hourly', ?, ?)""",
    (pid, customer_id, "Project title", "Description without em-dashes.", now, now),
)
for pos, (title, desc) in enumerate([("Task one", "Detail."), ("Task two", "Detail.")]):
    cur.execute(
        """INSERT INTO tasks (id, project_id, title, description, status, position, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'todo', ?, ?, ?)""",
        (cid(), pid, title, desc, pos, now, now),
    )
con.commit(); con.close()
```

## After writing

The running app won't show changes until it **refetches** (TanStack Query has `refetchOnWindowFocus: false`). Tell the user to navigate to / reopen the relevant page, or press Cmd+R. No app restart is needed for data changes (only schema/migration or Rust/capability changes require restarting `pnpm tauri dev`).
