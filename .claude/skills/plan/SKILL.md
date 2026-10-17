---
name: plan
description: Use when the user asks for a plan, spec, implementation plan, design exploration, brainstorm, or wants to compare approaches before writing code — phrases like "plan this", "make a plan", "spec this out", "explore options for X", "compare approaches to Y", "write up the design", "brainstorm 6 directions". Produces a rich, self-contained HTML file in `.claude/plans/` with mockups, diagrams, file maps, and code snippets — not a markdown todo list. Auto-opens in the browser when done. Do NOT use for handovers/PR writeups (use the `handover` skill) or for trivial single-step tasks (just do them).
---

# Plan (HTML)

Produce a **rich HTML plan** instead of a markdown todo list. HTML lets us show side-by-side option comparisons, mockups, SVG data-flow diagrams, syntax-highlighted code snippets, and clickable checklists — things that don't fit in markdown.

## When to use

Use for any non-trivial task before writing code:

- Implementation plans for features touching 3+ files
- Design explorations ("compare 6 approaches to X")
- Refactor strategies
- New screen / module specs with mockups
- Architecture decisions with tradeoffs

**Skip** for trivial fixes (typo, single-line bug, rename). Just do those.

## Workflow

1. **Clarify scope** — if the user's ask is ambiguous, ask 1–3 sharp questions before writing.
2. **Decide the slug** — short, kebab-case, derived from the task. e.g. `add-invoice-export`, `refactor-timer-state`, `dashboard-redesign`.
3. **Pick the template variant**:
   - **Spec** — one chosen direction; focus on implementation steps + file map + code
   - **Exploration** — 3–6 distinct approaches side-by-side, then a recommendation
   - **Design** — UI-heavy with mockups (use inline SVG or styled HTML/CSS)
4. **Write the file** to `.claude/plans/<slug>.html`.
5. **Open it** — run `open .claude/plans/<slug>.html` so the user sees it immediately.
6. **Summarize in one line** — "Plan written to [.claude/plans/<slug>.html](.claude/plans/<slug>.html), opened in browser."

## Content rules

- **TL;DR at the top.** 2–3 sentences. The user should know the bottom line before scrolling.
- **Visual hierarchy.** Use Tailwind utility classes. Section headers with anchors. Cards for grouped content.
- **Mockups, not descriptions.** If it's UI, render a real shadcn-style mockup with HTML+CSS — don't describe a button, show it.
- **Diagrams, not bullet lists.** Data flow → inline `<svg>`. Component tree → nested boxes. State machine → boxes + arrows.
- **Code snippets are first-class.** Use `<pre><code class="language-ts">` so highlight.js styles them. Annotate with sibling `<aside>` notes for the non-obvious lines.
- **File map as a tree**, not a flat list. Show `+ added`, `~ modified`, `- removed` markers.
- **Implementation steps as clickable checkboxes** (`<input type="checkbox">`). Users can tick them off in the browser.
- **Open questions section at the bottom.** Surface what you're not sure about.
- **No more than ~3 H2 sections per screen** — keep it scannable.

## Template

Use this as the skeleton. Drop sections that don't apply; never bloat.

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>PLAN_TITLE — Plan</title>
<script src="https://cdn.tailwindcss.com"></script>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.10.0/build/styles/github-dark.min.css" media="(prefers-color-scheme: dark)" />
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.10.0/build/styles/github.min.css" media="(prefers-color-scheme: light)" />
<script src="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.10.0/build/highlight.min.js"></script>
<style>
  :root {
    --bg: #fafafa; --fg: #0f172a; --muted: #64748b; --card: #ffffff;
    --border: #e2e8f0; --accent: #2563eb; --good: #16a34a; --warn: #d97706; --bad: #dc2626;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0b0f1a; --fg: #e2e8f0; --muted: #94a3b8; --card: #111827;
      --border: #1f2937; --accent: #60a5fa; --good: #4ade80; --warn: #fbbf24; --bad: #f87171;
    }
  }
  html, body { background: var(--bg); color: var(--fg); }
  body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; }
  .muted { color: var(--muted); }
  .accent { color: var(--accent); }
  .pill { display: inline-flex; align-items: center; gap: 4px; padding: 2px 10px; border-radius: 999px; font-size: 12px; font-weight: 500; border: 1px solid var(--border); }
  pre code.hljs { border-radius: 10px; padding: 14px 16px; font-size: 13px; line-height: 1.55; }
  code:not(.hljs) { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; background: color-mix(in srgb, var(--muted) 18%, transparent); padding: 1px 6px; border-radius: 4px; font-size: 0.9em; }
  .tree { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; line-height: 1.7; }
  .tree .add { color: var(--good); }
  .tree .mod { color: var(--warn); }
  .tree .del { color: var(--bad); text-decoration: line-through; text-decoration-color: var(--bad); }
  details > summary { cursor: pointer; user-select: none; }
  details[open] > summary { margin-bottom: 12px; }
  input[type="checkbox"] { accent-color: var(--accent); width: 16px; height: 16px; vertical-align: -3px; margin-right: 8px; }
  .anchor:hover .anchor-link { opacity: 1; }
  .anchor-link { opacity: 0; transition: opacity .15s; margin-left: 8px; color: var(--muted); text-decoration: none; }
  @media print {
    nav.sticky { display: none; }
    body { background: white; color: black; }
    .card { box-shadow: none; border-color: #ddd; }
  }
</style>
</head>
<body class="leading-relaxed">

<header class="border-b" style="border-color: var(--border)">
  <div class="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between flex-wrap gap-3">
    <div>
      <div class="text-xs uppercase tracking-wider muted">Plan · <!-- spec | exploration | design --></div>
      <h1 class="text-2xl font-semibold mt-1">PLAN_TITLE</h1>
    </div>
    <div class="flex gap-2 items-center">
      <span class="pill"><span style="width:8px;height:8px;border-radius:999px;background:var(--warn);display:inline-block"></span> Draft</span>
      <span class="muted text-sm">GENERATED_DATE</span>
    </div>
  </div>
</header>

<nav class="sticky top-0 z-10 backdrop-blur border-b" style="background: color-mix(in srgb, var(--bg) 85%, transparent); border-color: var(--border)">
  <div class="max-w-5xl mx-auto px-6 py-2 flex gap-4 text-sm overflow-x-auto whitespace-nowrap">
    <a href="#tldr" class="muted hover:accent">TL;DR</a>
    <a href="#context" class="muted hover:accent">Context</a>
    <a href="#approach" class="muted hover:accent">Approach</a>
    <a href="#architecture" class="muted hover:accent">Architecture</a>
    <a href="#files" class="muted hover:accent">Files</a>
    <a href="#steps" class="muted hover:accent">Steps</a>
    <a href="#snippets" class="muted hover:accent">Code</a>
    <a href="#open-questions" class="muted hover:accent">Open questions</a>
  </div>
</nav>

<main class="max-w-5xl mx-auto px-6 py-8 space-y-10">

  <section id="tldr" class="anchor">
    <h2 class="text-lg font-semibold mb-3">TL;DR <a href="#tldr" class="anchor-link">#</a></h2>
    <div class="card p-5 text-base">
      <!-- 2–3 sentence bottom line -->
    </div>
  </section>

  <section id="context" class="anchor">
    <h2 class="text-lg font-semibold mb-3">Context <a href="#context" class="anchor-link">#</a></h2>
    <p class="muted">Why we're doing this; what problem it solves; who's affected.</p>
  </section>

  <!-- For exploration variant: grid of approach cards -->
  <section id="approach" class="anchor">
    <h2 class="text-lg font-semibold mb-3">Approach <a href="#approach" class="anchor-link">#</a></h2>
    <div class="grid md:grid-cols-2 gap-4">
      <div class="card p-5 ring-2 ring-offset-2" style="--tw-ring-color: var(--accent)">
        <div class="flex justify-between items-start mb-2">
          <h3 class="font-semibold">Option A — RECOMMENDED</h3>
          <span class="pill">recommended</span>
        </div>
        <p class="text-sm">…</p>
        <div class="mt-3 text-xs muted"><strong>Tradeoff:</strong> …</div>
      </div>
      <div class="card p-5">
        <h3 class="font-semibold mb-2">Option B</h3>
        <p class="text-sm">…</p>
        <div class="mt-3 text-xs muted"><strong>Tradeoff:</strong> …</div>
      </div>
    </div>
  </section>

  <section id="architecture" class="anchor">
    <h2 class="text-lg font-semibold mb-3">Architecture & data flow <a href="#architecture" class="anchor-link">#</a></h2>
    <div class="card p-5">
      <!-- Inline <svg> diagram. Use viewBox so it scales. Label boxes + arrows. -->
      <svg viewBox="0 0 600 200" class="w-full h-auto">
        <!-- example: rect, line, text -->
      </svg>
    </div>
  </section>

  <section id="files" class="anchor">
    <h2 class="text-lg font-semibold mb-3">File map <a href="#files" class="anchor-link">#</a></h2>
    <div class="card p-5 tree">
      <div><span class="muted">src/</span></div>
      <div>  <span class="muted">db/</span></div>
      <div>    <span class="add">+ schema.ts</span></div>
      <div>  <span class="muted">features/invoices/</span></div>
      <div>    <span class="mod">~ invoice-list.tsx</span></div>
      <div>  <span class="muted">queries/</span></div>
      <div>    <span class="add">+ use-invoices.ts</span></div>
    </div>
  </section>

  <section id="steps" class="anchor">
    <h2 class="text-lg font-semibold mb-3">Implementation steps <a href="#steps" class="anchor-link">#</a></h2>
    <ol class="space-y-2 list-none pl-0">
      <li><label><input type="checkbox"> Add the table/columns to <code>db/schema.ts</code></label></li>
      <li><label><input type="checkbox"> <code>pnpm db:generate</code> the migration</label></li>
      <li><label><input type="checkbox"> Write the query hook in <code>queries/</code></label></li>
      <li><label><input type="checkbox"> Build the screen with shadcn components</label></li>
      <li><label><input type="checkbox"> <code>pnpm typecheck</code></label></li>
    </ol>
  </section>

  <section id="snippets" class="anchor">
    <h2 class="text-lg font-semibold mb-3">Key code snippets <a href="#snippets" class="anchor-link">#</a></h2>
    <div class="space-y-4">
      <div class="card p-5">
        <div class="text-xs muted mb-2">src/queries/use-invoices.ts</div>
<pre><code class="language-ts">export const useInvoices = (): UseQueryResult&lt;Invoice[], Error&gt; =&gt;
  useQuery({
    queryKey: ['invoices'],
    queryFn: (): Promise&lt;Invoice[]&gt; =&gt; db.select().from(invoices),
  });</code></pre>
      </div>
    </div>
  </section>

  <section id="open-questions" class="anchor">
    <h2 class="text-lg font-semibold mb-3">Open questions <a href="#open-questions" class="anchor-link">#</a></h2>
    <ul class="space-y-2">
      <li class="card p-4"><strong>Q:</strong> … <span class="muted">— needs decision before step 3</span></li>
    </ul>
  </section>

</main>

<footer class="max-w-5xl mx-auto px-6 py-10 muted text-xs">
  Generated by the <code>plan</code> skill · regenerate by re-prompting Claude with the same task.
</footer>

<script>hljs.highlightAll();</script>
</body>
</html>
```

## Mockup tips

When showing UI mockups, render a real shadcn-shaped card with Tailwind — `Card` with a header row, then content. Keep it neutral/macOS-flavored:

```html
<div class="card overflow-hidden">
  <div class="border-b px-4 py-3 flex justify-between items-center" style="border-color: var(--border)">
    <div class="font-medium">Settings</div>
    <button class="text-xs pill" style="background: var(--accent); color: white; border-color: var(--accent)">Save</button>
  </div>
  <div class="p-4 space-y-3">
    <label class="block text-sm">
      <div class="mb-1">Default hourly rate</div>
      <input class="w-full border rounded px-3 py-1.5 text-sm" style="border-color: var(--border); background: var(--bg)" value="850,00 kr" />
    </label>
  </div>
</div>
```

Map mockup elements to the real shadcn components they stand in for (e.g. `Card`, `Button`, `Input`, `Select`, `Dialog`, `Table`, `Tabs`) so the build step is unambiguous.

## After writing

Always run `open <path>` after `Write` succeeds. If the user is on a non-darwin platform, fall back to printing the `file://` link.
