---
name: handover
description: Use when the user wants to wrap up a session, summarize what was done, write a PR description, hand off context to a future Claude session, or produce a status/incident report — phrases like "write up what we did", "handoff this session", "summarize the work", "PR writeup", "status report", "what's the state", "where are we". Produces a rich, self-contained HTML file in `.claude/handovers/` with what shipped, decisions made, files touched, open issues, next steps, and a copy-paste context block for the next session. Auto-opens in the browser. Do NOT use for forward-looking plans (use the `plan` skill).
---

# Handover (HTML)

Produce a **handover HTML document** — a rich snapshot of where things stand at the end of a session, designed to be:

- Read by the user to confirm work is wrapped correctly
- Pasted (or linked) into a new Claude session so it can resume with full context
- Attached to a PR description for reviewers

The output is one self-contained HTML file in `.claude/handovers/<slug>.html` that opens in the browser.

## When to use

- "Let's wrap this up" / "handover this session"
- "Write up what we did" / "summarize"
- "PR description for this branch"
- "What's the current state?" / "where are we?"
- End of a long debugging session
- Before context compression in a long-running session

**Skip** if the user just wants a 1-line answer in chat.

## Workflow

1. **Gather state** before writing:
   - `git status` and `git diff --stat` for files touched
   - `git log` since branch divergence for the commit timeline
   - Re-read any in-flight TODOs from the conversation
2. **Decide the slug** — kebab-case, derived from the branch or task. e.g. `add-invoice-export`, `fix-timer-restart`, `2026-06-27-session`.
3. **Write the file** to `.claude/handovers/<slug>.html`.
4. **Open it** — `open .claude/handovers/<slug>.html`.
5. **Summarize in one line** — "Handover written to [.claude/handovers/<slug>.html](.claude/handovers/<slug>.html), opened in browser."

## Content rules

- **Status pill at the top** — `shipped`, `in-progress`, `blocked`, `abandoned`. Color-coded.
- **Honest TL;DR.** Don't gloss over half-finished work — if step 3 isn't done, say so.
- **Decisions log is the most valuable section.** Each entry = question → decision → rationale. This is what future-Claude can't reconstruct from git.
- **Files touched section** annotates the *why* per file, not just the path. `git diff --stat` covers the what.
- **Open issues & next steps must be distinct.**
  - *Open issues* = unresolved questions or known bugs that block progress
  - *Next steps* = concrete actions the next session should take
- **Resume-from-here block** at the bottom — a `<pre>` with a self-contained prompt that, when pasted into a new Claude session, gives it enough context to continue. Include the branch name, the goal, the file paths, and the open issues.
- **No silent omissions.** If something feels embarrassing or unfinished, it goes in the doc — that's the entire point of a handover.

## Template

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>HANDOVER_TITLE — Handover</title>
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
  .pill { display: inline-flex; align-items: center; gap: 6px; padding: 3px 12px; border-radius: 999px; font-size: 12px; font-weight: 600; border: 1px solid var(--border); }
  .pill .dot { width: 8px; height: 8px; border-radius: 999px; display: inline-block; }
  .pill.shipped { color: var(--good); border-color: color-mix(in srgb, var(--good) 40%, transparent); }
  .pill.shipped .dot { background: var(--good); }
  .pill.wip { color: var(--warn); border-color: color-mix(in srgb, var(--warn) 40%, transparent); }
  .pill.wip .dot { background: var(--warn); }
  .pill.blocked { color: var(--bad); border-color: color-mix(in srgb, var(--bad) 40%, transparent); }
  .pill.blocked .dot { background: var(--bad); }
  pre code.hljs { border-radius: 10px; padding: 14px 16px; font-size: 13px; line-height: 1.55; }
  code:not(.hljs) { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; background: color-mix(in srgb, var(--muted) 18%, transparent); padding: 1px 6px; border-radius: 4px; font-size: 0.9em; }
  .filerow { display: grid; grid-template-columns: auto 1fr; gap: 16px; padding: 10px 0; border-top: 1px solid var(--border); }
  .filerow:first-child { border-top: 0; }
  .filerow code { white-space: nowrap; }
  .marker { display: inline-block; width: 18px; text-align: center; font-weight: bold; font-family: ui-monospace, monospace; }
  .marker.add { color: var(--good); }
  .marker.mod { color: var(--warn); }
  .marker.del { color: var(--bad); }
  .anchor:hover .anchor-link { opacity: 1; }
  .anchor-link { opacity: 0; transition: opacity .15s; margin-left: 8px; color: var(--muted); text-decoration: none; }
  .copy-btn { font-size: 11px; padding: 4px 10px; border-radius: 6px; border: 1px solid var(--border); background: var(--card); color: var(--fg); cursor: pointer; }
  .copy-btn:hover { border-color: var(--accent); color: var(--accent); }
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
      <div class="text-xs uppercase tracking-wider muted">Handover</div>
      <h1 class="text-2xl font-semibold mt-1">HANDOVER_TITLE</h1>
    </div>
    <div class="flex gap-2 items-center flex-wrap">
      <!-- Pick one: shipped | wip | blocked -->
      <span class="pill wip"><span class="dot"></span> In progress</span>
      <span class="muted text-sm">GENERATED_DATE</span>
    </div>
  </div>
  <div class="max-w-5xl mx-auto px-6 pb-4 muted text-sm">
    Branch <code>BRANCH_NAME</code> · <code>N</code> commits since <code>BASE_BRANCH</code>
  </div>
</header>

<nav class="sticky top-0 z-10 backdrop-blur border-b" style="background: color-mix(in srgb, var(--bg) 85%, transparent); border-color: var(--border)">
  <div class="max-w-5xl mx-auto px-6 py-2 flex gap-4 text-sm overflow-x-auto whitespace-nowrap">
    <a href="#tldr" class="muted hover:accent">TL;DR</a>
    <a href="#done" class="muted hover:accent">What shipped</a>
    <a href="#files" class="muted hover:accent">Files</a>
    <a href="#decisions" class="muted hover:accent">Decisions</a>
    <a href="#open" class="muted hover:accent">Open issues</a>
    <a href="#next" class="muted hover:accent">Next steps</a>
    <a href="#resume" class="muted hover:accent">Resume block</a>
  </div>
</nav>

<main class="max-w-5xl mx-auto px-6 py-8 space-y-10">

  <section id="tldr" class="anchor">
    <h2 class="text-lg font-semibold mb-3">TL;DR <a href="#tldr" class="anchor-link">#</a></h2>
    <div class="card p-5 text-base">
      <!-- 2–3 sentences. Be honest about unfinished work. -->
    </div>
  </section>

  <section id="done" class="anchor">
    <h2 class="text-lg font-semibold mb-3">What shipped this session <a href="#done" class="anchor-link">#</a></h2>
    <ul class="space-y-2">
      <li class="card p-4"><strong>Added X.</strong> <span class="muted">Brief why and how.</span></li>
      <li class="card p-4"><strong>Refactored Y.</strong> <span class="muted">Brief why and how.</span></li>
    </ul>
  </section>

  <section id="files" class="anchor">
    <h2 class="text-lg font-semibold mb-3">Files touched <a href="#files" class="anchor-link">#</a></h2>
    <div class="card px-5 py-2">
      <div class="filerow">
        <div><span class="marker add">+</span> <code>src/queries/use-invoices.ts</code></div>
        <div class="muted text-sm">New query + mutation hooks for invoices.</div>
      </div>
      <div class="filerow">
        <div><span class="marker mod">~</span> <code>src/db/schema.ts</code></div>
        <div class="muted text-sm">Added <code>invoices</code> + <code>invoice_line_items</code> tables.</div>
      </div>
      <div class="filerow">
        <div><span class="marker del">−</span> <code>src/lib/old-pdf.ts</code></div>
        <div class="muted text-sm">Replaced by the @react-pdf/renderer template.</div>
      </div>
    </div>
  </section>

  <section id="decisions" class="anchor">
    <h2 class="text-lg font-semibold mb-3">Decisions made <a href="#decisions" class="anchor-link">#</a></h2>
    <div class="space-y-3">
      <div class="card p-5">
        <div class="text-xs uppercase tracking-wider muted">Decision</div>
        <div class="font-medium mt-1">Store money as integer minor units</div>
        <div class="muted text-sm mt-2"><strong>Why:</strong> avoids float rounding drift on invoice totals. Tradeoff: every display path must format minor units → currency string.</div>
      </div>
    </div>
  </section>

  <section id="open" class="anchor">
    <h2 class="text-lg font-semibold mb-3">Open issues <a href="#open" class="anchor-link">#</a></h2>
    <ul class="space-y-2">
      <li class="card p-4"><strong>Multi-currency invoice guard.</strong> <span class="muted">A multi-project invoice must reject mixed currencies — not enforced yet.</span></li>
    </ul>
  </section>

  <section id="next" class="anchor">
    <h2 class="text-lg font-semibold mb-3">Next steps <a href="#next" class="anchor-link">#</a></h2>
    <ol class="space-y-2 list-decimal pl-5">
      <li>Wire the PDF save dialog to <code>tauri-plugin-dialog</code>.</li>
      <li>Add the invoice status lifecycle (draft → sent → paid).</li>
    </ol>
  </section>

  <section id="resume" class="anchor">
    <h2 class="text-lg font-semibold mb-3">Resume-from-here block <a href="#resume" class="anchor-link">#</a></h2>
    <p class="muted text-sm mb-2">Paste this into a new Claude session to continue with full context.</p>
    <div class="relative">
      <button class="copy-btn absolute right-3 top-3" onclick="navigator.clipboard.writeText(document.getElementById('resume-text').innerText)">Copy</button>
<pre id="resume-text" class="card p-5 text-sm font-mono whitespace-pre-wrap" style="white-space:pre-wrap">I'm picking up work from a prior session.

GOAL: <one sentence — what we're ultimately trying to ship>
BRANCH: BRANCH_NAME (off BASE_BRANCH)

DONE:
- <bullet>

OPEN:
- <issue>

NEXT:
1. <step>

Key files:
- src/db/schema.ts
- src/queries/use-invoices.ts

Full handover: .claude/handovers/&lt;slug&gt;.html</pre>
    </div>
  </section>

</main>

<footer class="max-w-5xl mx-auto px-6 py-10 muted text-xs">
  Generated by the <code>handover</code> skill on GENERATED_DATE.
</footer>

<script>hljs.highlightAll();</script>
</body>
</html>
```

## Status pill colors

Pick one based on the actual state:

- **`shipped`** (green) — work is complete, merged or ready to merge
- **`wip`** (amber) — partial; explicit next steps remain
- **`blocked`** (red) — stopped on an external dependency or open question

## After writing

Always run `open <path>` after `Write`. If on a non-darwin platform, print the `file://` link.
