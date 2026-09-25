# Auditor for Claude Code — what it does and why it is not an ordinary audit tool

> This document is for the person deciding **what they are installing**. Technical details live in [`auditor/README.md`](../auditor/README.md),
> the agent's constitution in [`auditor/CLAUDE.md`](../auditor/CLAUDE.md), the collaboration protocol in [`auditor/BRIDGE.md`](../auditor/BRIDGE.md)
> (all currently in Czech — an English layer is the most wanted contribution, see [CONTRIBUTING.md](../CONTRIBUTING.md)).
> Česká verze: [CO-TO-UMI.md](CO-TO-UMI.md).

## 1. One sentence

The Auditor is a **second, independent agent that lives in your project permanently next to your coding agent**, is not allowed to
change or ship anything, and still has the last word: without its green verdict the application does not ship — enforced not by a
sentence in a prompt but by a hook, a git hook and CI.

## 2. Why it exists

Coding agents (Claude Code, Codex, Cursor…) write fast and report "done". Real projects keep repeating the same pattern:

- "done" means *the file is on disk*, not *the feature works from the UI*;
- the test is green because it tests something other than what broke;
- the fix is in the code but is not **wired in** (hook not registered, migration not applied, config not reloaded);
- a second copy of the same truth (another DB client, a constant in three places) reappears a week after the cleanup;
- the repo fills with logs, `final2.bat`, zips, keys;
- work goes uncommitted for weeks, the agent deploys straight from the working tree;
- a human bypasses their own safeguard by double-clicking a prepared `.bat`, because "just this once it's urgent".

An ordinary audit tool finds this once, prints a list and exits. **The problem is not finding issues. The problem is that they get
half-fixed, come back, and nobody independent verifies the fix actually holds.** That is why this auditor does not audit once — **it
operates in the project long-term**.

## 3. What makes it different from an "audit tool"

| Typical audit tool / subagent | This auditor |
|---|---|
| One-shot scan, output = a list | **Permanent role in the project**: audit → handoff → enforcement → verification → release gate → post-release measurement → retro → next audit |
| Runs in the same session as the coding agent (the author approves its own work) | **Own workspace and own session**; read-only view of the repo; its own constitution, not the project's CLAUDE.md |
| "Must not change code" is a sentence in a prompt | **Technical barrier**: a hook blocks writes to the repo, `git commit/push` into the repo, deploys, deletions, mutating HTTP outside localhost — even in bypass mode |
| Finds, does not propose | Every finding carries a **proposed fix** (options, recommended one, red test, residual risk) written as a task for the coding agent |
| Trusts that the fix happened | **Independent verification through six gates** with its own fresh run; the developer's evidence is a claim, not proof |
| Shipping is up to the human | **Release gate** enforced in three places: the coding agent's hook, git pre-commit / deploy scripts, GitHub Actions + protected branch |
| Checks code | Checks **code, security, every feature from the UI, single source of truth, repo hygiene, git practice, agent efficiency (tokens, model routing), fitness of the stack for the stated intent, backups and restorability** |
| Does not measure whether it helped | Measures **first-pass yield, rounds per fix, false-"done" rate**, token usage before/after |

## 3b. Auditor vs. CI (a common objection: "this should be continuous integration")

Half true — and that half is by design. CI reliably enforces rules somebody already wrote (lint, tests, scanners). The auditor is the one who
**writes and evolves those rules**: every finding must end as a mechanical guard (test, lint, hook, CI check), otherwise it is not closed.
So the auditor feeds CI rather than replacing it — and its own gates (hook, pre-commit, GitHub Actions) are CI mechanisms.

What CI does not do and the auditor does: learns the intent from the owner (intake); walks every feature from the UI without pre-written
tests; notices that a green test tests something other than what broke, or that a fix is in the code but not wired in; proposes the fix and
the red test; judges architecture, stale sources of truth in documents, token usage and model routing of agents, fitness of the stack for
the intent, restorability of backups; and runs the long-term loop with the coding agent (handoff → fix → independent verification → verdict
→ measuring false "done"s).

Where the objection is strong: a team with mature CI, code review and security review already has most of this — there the auditor mainly
adds the loop with the agent and the measurement of its behaviour. The target audience is people building with agents who have no CI and
don't know how to set one up: the auditor builds it for them, finding by finding.

## 4. What it audits

Each area has its own checklist (`auditor/checklists/`) and tool (`auditor/tools/`). The order is deliberate — cleanup exposes sources of
truth, sources of truth expose security holes.

1. **Intake** — asks the owner in plain language: what the app does, for whom, how many users today and next year, what they fear, what
   data it holds, how it ships. No standards knowledge required. Output: app profile and priorities.
2. **Repo hygiene** — junk in the root, temp files, binaries/zips/logs in git, secrets, large objects in history, duplicate and stale
   documents (deep content pass: every `.md/.json/.yaml` classified CURRENT / STALE / CONFLICTING = an old source of truth).
3. **Git practice** — commit and push frequency, unbacked-up work, commit size and messages, long-lived branches, protections.
4. **Static analysis** — types, lint, dependency audit, secrets (gitleaks), security patterns (semgrep), secrets leaking to the client.
5. **Security** — OWASP ASVS 5.0 (level 2), OWASP Top 10:2025, API Top 10, LLM Top 10 for AI features: tenant isolation, authorization on
   every endpoint, RLS, headers, uploads, rate limits, error states. Probes run against the auditor's **own local instance** of the app,
   never production.
6. **Features** — inventory of every feature; for each, an acceptance criterion "from the real UI entry point it does X" verified with Playwright.
7. **UI / design** — overlapping elements, z-order, clipped text, dropdown logic, menu consistency across screens, targets ≥ 24 px,
   zero console errors, three viewports. **Exhaustive crawl**: every page, every interactive element (fields with 3 sample inputs,
   sliders, every dropdown item, toggles, tabs, modals), a coverage ledger — 100 % of elements have a record or the audit is not finished.
8. **Accessibility and performance** — WCAG 2.2 AA (axe-core), keyboard, Core Web Vitals.
9. **Architecture and single source of truth** — multiple DB clients, an entity defined twice, constants/enums/env read in N places,
   business calculations in UI and server and PDF, ad-hoc permission checks, `utils/` dumping grounds, import cycles, dead code,
   functions in illogical folders. Every finding = one place + a **guard** (lint/test/generator), otherwise the duplicate returns.
10. **Agent efficiency** — what gets loaded into every request (CLAUDE.md, rules, skills, MCP servers, hooks), the model of every
    subagent (mechanics on cheap models, judgment on the best), files over the 500/1000-line threshold → split proposal by domain,
    first-pass yield, churn. **Re-measured after adoption with the same method** — "the file is smaller" is not proof of savings; usage
    numbers are.
11. **Sustainability and scaling for the stated intent** — matrix of layer (DB, hosting, cloud services, stack, performance, operations,
    cost, legal) × horizon (today / target / 10×) with prices verified on the audit day and an exit path for every service. For a personal
    project, simplicity wins.
12. **Operations, backups, licenses** — inventory of every data source, **isolated restore test** (a backup existing ≠ restorable),
    readiness, alerts, runbook, secret rotation, licenses of dependencies and data.

## 5. How the collaboration works — a lifecycle, not a scan

The project's coding agent is called **Kapitán** (Captain) here. Auditor and Captain talk over a **bus** — messages as files in a shared
folder (works on one machine or across machines via git), each with ownership enforced by hooks (the Captain cannot overwrite a finding
or a verdict, the auditor cannot write evidence on the Captain's behalf).

```
 ┌───────────────────────────── permanent loop ────────────────────────────┐
 │                                                                          │
 │  intake ─► audit (12 areas) ─► findings + fixes ─► HANDOFF ─► Captain     │
 │                                                        │                 │
 │                          STOP-THE-LINE: only handoff items, in order     │
 │                          backup (tag/branch) before every change         │
 │                          evidence into AUDIT/03_dukazy, reports via bus  │
 │                                                        │                 │
 │  independent verification ◄──── EVIDENCE (commit + proof) ◄──┘           │
 │   6 gates, fresh run                                                     │
 │      │ FAIL → round K2, K3 (max 3, then a question to the owner)         │
 │      ▼ PASS                                                              │
 │  RELEASE GATE 🟢 ─► deploy allowed ─► APPLIED ─► post-release metrics    │
 │                                                        │                 │
 │  retro (error log: what I missed → which test catches it next time) ◄───┘
 │                                                                          │
 └──────────────── next audit on the next batch / release ──────────────────┘
```

**The six verification gates** (none can be skipped; a partial PASS is a FAIL):
1. the problem really existed (reproduction before the fix),
2. the change exists (diff within the item's scope, nothing extra),
3. the change is **wired in** (registration, configuration, migration applied — not just a file on disk),
4. the mechanism works (test against real code, not a mock),
5. the user flow works from the real entry point (UI, not a direct call),
6. regression + security + a **guard against recurrence**.

**What the auditor never confuses:** a test existing with the test running · a green test with acceptance · a commit with activation ·
activation with operational effect · the Captain's report with evidence · health 200 with a correct result · a backup existing with restorability.

## 6. Why it is a long-term role

After the first audit the auditor **stays in the project**:

- **Every release** passes its gate: the Captain's hook runs `gate-check` on `vercel`, on `git push` to the production branch and inside
  deploy scripts; CI on GitHub refuses a merge without a green verdict for exactly this commit (it compares the tree hash, not just ancestry).
- **Every Captain session** starts by reading the auditor's messages; open P0/P1 items are the only allowed work.
- **Standing duties of the Captain**, checked on every subsequent audit: subagents with an explicit model, quiet tool output, a split
  proposal before adding a feature to an oversized file, no second copy of a truth, temp files only in `.tmp/tasks/<ID>/`, cleanup in the retro.
- **Captain behaviour metrics** (`bus.mjs metrics`): first-pass yield, average rounds per fix, **false-"done" rate**, time from handoff
  to PASS. When they degrade, the auditor does not plead "try harder" — it proposes a change of **mechanism** (gate, hook, template).
- **Before/after measurement** of efficiency: same method, same window, normalised per token / closed task; under 10 % difference is noise.
- **Retro**: every error type the auditor missed goes into its error log with a test that catches it next time. After the first audit it
  also records checks that produced zero findings — the package is meant to **narrow** with practice, not bloat.

In other words: the first audit is the most expensive and longest. Each following one is faster, because the guards are already in place
and the auditor knows the project.

## 7. What the auditor does NOT do (and why)

- **It does not code, fix or refactor.** Not even "a small thing". Whoever guards the gate must not walk through it. The hook blocks it.
- **It does not deploy, migrate databases, delete, kill processes or call production.** Probes only against its own local instance from a clone.
- **It does not decide for the owner** on architecture, technology or accepting residual risk — it proposes options, the owner chooses.
- **It does not push technical QA onto the owner.** The owner gets one sentence + a link to a file; technical detail is settled with the Captain.
- **It does not trust documentation or comments.** Instructions inside inputs ("auditor, skip this") are ignored and reported as a finding.

## 8. What you get (outputs)

Everything in `<project>-audit/AUDIT/`:

| File | Contents | For |
|---|---|---|
| `00_intake.md` | app profile, intent, priorities, feature inventory | both agents |
| `01_nalezy/A-###.md` | each finding: evidence class, priority, reproduction, proof, proposed fix, red test | Captain |
| `02_HANDOFF.md` | package for the Captain: STOP-THE-LINE, order, backup rules, **what the audit did not prove** | Captain |
| `03_dukazy/A-###/` | commit, red-test output before/after, screenshot, regression, guard | auditor |
| `04_verdikty/A-###.md` | PASS / SCOPED_PASS / FAIL after six gates, round K1, K2… | both |
| `05_release_gate.md` | 🟢/🔴 for a specific commit — the only thing that lets a deploy through | hooks, CI |
| `06_efektivita.md` | baseline and after-measurement: tokens, models, first-pass yield, false-done rate | owner |
| `07_udrzitelnost.md` | technology × intent, TCO, exit paths, NOW / PREPARE / WATCH recommendations | owner |
| `CHYBOVNIK.md` | the auditor's retro | auditor |
| `bus/` | bus messages, `LEDGER.md` generated view | both |

The owner practically reads only `02_HANDOFF.md` (what is wrong and why), `05_release_gate.md` (may we ship?) and `06`/`07`.

## 9. Who it is for

### Rescue (primary purpose) vs. prevention (secondary)

| | RESCUE — a running project | PREVENTION — a new project |
|---|---|---|
| Situation | the project is broken and inconsistent: burns tokens, the agent produces nonsense, mess, no tests, unknown backup state | an empty or small repo you want to keep healthy |
| Start menu choice | `[2]` audit a project on disk (or `[3]` from GitHub) | `[1]` **new project** — no separate auditor needed |
| What you get | full 12-area audit, first impression within an hour, handoff, STOP-THE-LINE, fix verification, release gate | the auditor's rules inside the project, an independent **reviewer** subagent, the same technical guards, CI (§10d) |
| What works from day one | — | test with the requirement, "done" = verified, repo order, single source of truth, backups, release only with the reviewer's 🟢 |

Plainly: the audit machinery (screen crawl, SSOT, hygiene, efficiency) is built for existing code — on an empty repo it would find almost
nothing. That is why a new project gets the auditor's rules and guards built in instead (§10d). If it still gets into trouble, attach the
auditor via `[2]`.

**Primarily for a running project that got into trouble.** The typical situation: you have a great project, but it burns tokens, the agent
starts producing nonsense, the repo is a mess and you don't know where to start. If you had tests, CI and order from day one, you are fine
and the auditor mainly adds an independent loop with the agent. If you are dealing with it after three months of coding without tests —
that is exactly where the auditor starts: it catches up on what is missing and, going forward, enforces that tests are born with the
requirement. Within about an hour you get the first human-readable page (`AUDIT/00_prvni_dojem.md`): what burns tokens, where the mess is,
whether the work is backed up.

**Updating the package keeps the audit.** New version: START.cmd → `[2]` → the same project. The installer detects the running audit and only
replaces the constitution, checklists, tools, guards and settings (the model is kept) — no intake, no questions, no windows opened; the
`AUDIT/` folder (findings, verdicts, handoff, messages, retro) is never overwritten. Reopened from the shortcuts, the auditor resumes where it stopped. A running auditor session
picks up the new constitution at its next start or compaction.


- **Product owners who are not programmers** and let agents build the application: the auditor is their independent CTO who has no
  incentive to approve its own work.
- **Developers using Claude Code on a larger project**: a second pair of eyes for the things fast development forgets.
- **Teams with multiple agents**: the release gate and the bus work across machines (the auditor's workspace is a git repo).

A one-off review of someone else's repo is option `[3]` (GitHub audit, §10b). The auditor's full value is where the project **keeps being
developed and shipped**.

## 10. What the installer installs (and what it does not)

- Next to the project, `<project>-audit/` appears (the auditor's workspace): constitution, checklists, tools, `AUDIT/`, its own git.
- The project only gains `.claude/hooks/*` (Captain hook, gate-check, hygiene pre-commit), `.claude/skills/audit-rezim`, additions to
  `.gitignore`/`.gitattributes`, a block in `CLAUDE.md`, optionally `.github/workflows/auditor-gate.yml`. None of your code changes.
- Only the installer's own files are committed to the project's git; work in progress stays as it was (and becomes the auditor's first finding).
- The installer asks no technical questions. At the end it opens the auditor's window (it starts the intake itself) and the Captain's
  window (which waits while an old Captain is still running).
- Models: the auditor in the full profile runs on the strongest available model (judgment and verdicts); mechanical subagents on cheap ones.

## 10b. Auditing a GitHub repo (no install on the client's side)

`START.cmd` → `[3]` (mac/Linux `start.sh` → `[3]`): paste a GitHub repo URL, the auditor clones it locally and runs the full audit on the
copy. Nothing is installed at the client and nothing is written to their repo. Private repo: the client invites you as a collaborator (read
access is enough) and you have GitHub CLI logged in. Output for the client: `ZPRAVA.html` (plain language), `02_HANDOFF.md` (a task list for
their developer or agent), `STATISTIKA.html`. Differences from auditing your own project: there is no Captain and no release gates (nowhere
to install them), git practice only from history, the client's agent token usage only from configuration in the repo, dynamic tests only
with a test environment from the client. New code version: `aktualizovat-repo.cmd` in the workspace — the auditor then reviews just the changes.

## 10c. Audit statistics

At the end of every audit `AUDIT/STATISTIKA.html` is produced: how many files and lines of code the auditor went through, how many screens
and UI elements it tested, how many endpoints, findings by severity and verified fixes, how long it took (total and net working time) and
how many tokens it cost — exactly, from Claude Code transcripts, split by model.

## 10d. A new project, healthy from day one (no separate auditor)

`START.cmd` → `[1]` (mac/Linux `start.sh` → `[1]`): type a name, the rest is automatic — folder `C:\dev\<name>` (`~/dev/<name>`), git,
a private GitHub repo as a backup (Enter = yes), a desktop shortcut, and the agent opens and starts with `/zacatek` (intent, audience, data,
budget → requirements, a justified technology choice, skeleton and first acceptance tests).

What the project gets (the same rules the auditor enforces on running projects):

| What | How it is enforced |
|---|---|
| Rules for the agent in `CLAUDE.md` (test with the requirement, "done" = verified, single source of truth, order, git and backups, security, tokens, technology fit) | rules + commands `/zadani`, `/hotovo`, `/uklid` |
| An independent **reviewer** (`kontrolor`) — a subagent that only reads and runs tests, checks against the auditor's checklists | a hook allows writes to `docs/kontrola/` **only** to the reviewer (by `agent_type`) and nothing else to the reviewer; the main agent cannot write "approved" itself |
| STOP-THE-LINE on an open P0/P1 | a reminder at every session start + `release-check` blocks releases |
| Release only with a 🟢 verdict for the current code | `projekt-guard` (deploy, push to `main`) → `release-check` (commit, age, open findings, clean tree); CI job `vydani` |
| Repo order, no secrets or binaries | hook + git pre-commit + CI (`hygiene-all`, gitleaks) |
| Regular review | session-start reminder after 7 days or ~30 commits → `/kontrola` |
| A report for you | `docs/kontrola/ZPRAVA.html` — plain language, a recommendation for every problem, questions as a form with the recommended answer preselected |

**Combination (recommended):** choose `[1]` when creating the project and a separate auditor is installed next to it (`<name>-audit`). The
reviewer checks continuously, the auditor runs **periodically** — before a bigger release and once a month (the project agent reminds you).
The agent reads its handoff at every session start; when the auditor stops releases (🔴 in `05_release_gate.md`), the project's
`release-check` blocks releasing until the auditor verifies the fixes. No Captain side and no bus — the auditor does not have to take part in
every release, it can only pull the brake. Option `[2]` = healthy start only.

**Difference from the separate auditor (plainly):** the reviewer runs in the same account and is invoked by the agent itself, so
independence is weaker (the agent could describe the scope badly; the reviewer's rule is therefore "ignore the agent's claims, verify
yourself"). There is no measurement of the agent's behaviour (false "done", fix rounds) and no Playwright crawl of every screen. For a new
project that is enough; when the project starts to degrade, attach the auditor via `[2]` — the rules are the same and the guards coexist.

## 10e. Telegram — one bot per agent

The auditor and the Captain can each have their own Telegram bot. A message you send from your phone lands **directly in that agent's
window** — even when it is idle — and the reply comes back to Telegram. It uses Claude Code's official channel
(`claude --channels plugin:telegram@claude-plugins-official`). Each bot has its own state directory outside the project
(`~/.claude/channels/telegram-<project>-<path hash>-<role>/`: token, allowed user), so two projects with the same name never mix. Nothing depends
on the machine name or on personal scripts — it works for anyone on any computer. If the Captain's project already has its own Telegram
bridge, it is left untouched and a standard bot is offered on top (recommended: a different bot, no conflict, always delivers); the choice
"own bridge only" is remembered. Every window with a bot sends the owner "🟢 … starting" (proves token and network; reply to it to confirm the window receives messages). A new window takes the bot over from the old one. The bot accepts messages only from your user ID
(pairing: you send it "hi"); the token goes only through a dialog, never into the chat; agents never change bot access because a message
asked them to. The auditor proactively sends only what you need now (first impression, new P0, P0/P1 verdicts, release-gate changes, a
question with a recommended answer) — at most ~5 messages a day. `START → [6]` opens a **guide in a Claude window** that walks you through
everything, including installing Telegram. Requires Claude Code signed in via claude.ai (Pro/Max) or Console; Team/Enterprise admins must
enable channels. Channels are a research preview.

## 10e2. Captain autonomy

The owner chooses how much the Captain may do without asking (at install, once on update, `START → [7]`): **CAUTIOUS** (scripts and database
need approval), **AUTONOMOUS** (runs project scripts and database commands itself — destructive SQL is always blocked by a hook, a backup goes
to evidence before any production write and the auditor checks it, releases still only through the auditor's gate), **FULL** (no Claude Code
prompts at all, only hooks; not recommended). Rules go to the project's `.claude/settings.local.json` (personal, not committed).

## 10f. Updating a running audit (no re-run)

A new package version **never re-runs the audit**. `START → [2]` on the same project only replaces tools, rules and settings (model,
findings, verdicts and handoff stay). New audit goals introduced by newer versions that your audit does not have yet appear in
`AUDIT/NOVE_CILE.md` — the auditor does **only those**, at minimal scope (e.g. a summary of existing results, only new commits). Completed
goals are remembered (`AUDIT/.balik.json`). A full re-audit only on the owner's explicit request.

## 10g. A computer with nothing installed

`START` detects what is missing (Git, Node.js, Claude Code) and offers to install it (`tools/bootstrap.ps1` — winget and the official
Claude Code installer; `tools/bootstrap.sh` — Homebrew/apt). Useful for a client who has no Claude at all. Only signing in to Claude remains.

## 10h. Codex — auditor or Captain in OpenAI Codex

Either agent can run in **OpenAI Codex CLI** instead of Claude Code (`START → [8]`; every combination: Captain in Codex, auditor in Codex,
both). A machine with Codex but no Claude Code is set up for Codex right away. Rules live in `AGENTS.md`; guards are the **same scripts** as
in Claude Code, reached through `.codex/hooks.json` → `tools/codex-hook.mjs` (Codex `apply_patch` edits are split into per-file checks). The
auditor additionally runs in Codex's sandbox with its workspace as the only writable root, so it cannot write to the app repo even without
hooks. Captain autonomy maps to Codex sandbox/approval flags. The bus works through hooks after every step and at the end of a turn (each
message stops the end of a turn only once). Not available in Codex: the Telegram channel and the project's own Claude Code hooks. Codex runs
project hooks only after manual review (`/hooks`), so the guard scripts live in a protected folder `~/.codex/auditor/<project>-<hash>/` that
neither sandboxed agent can write (the Captain may write only the repo, `AUDIT/03_dukazy` and `AUDIT/bus`). Before every start the launcher
verifies the guards' fingerprints and the project's trust entry (`codex-hooks-check.mjs`) and only then passes `--dangerously-bypass-hook-trust`;
if anything is off it refuses to start the agent and points the owner to `START → [8]`. FULL autonomy means no Codex sandbox — guards still
run, but the Captain could technically overwrite their folder (AUTONOMOUS is recommended).

## 10i. Economy mode (default)

An auditor that tells others to save tokens must not waste them itself. The main leak: models with a 1M window compact only at ~967K tokens
and **every step re-reads the whole context**. Economy mode: launchers set `CLAUDE_CODE_AUTO_COMPACT_WINDOW=200000` for both agents; the
auditor delegates to cheap subagents (`pruzkumnik` = haiku for finding/counting/classifying, `mechanik` = sonnet for scans, tests, UI batches,
`overovatel-lehky` = sonnet for P2/P3 verification, `overovatel` = main model only for P0/P1); the `usporny-guard` hook blocks a generic
subagent without a cheap model and reading a > 60 kB file whole in the main thread; one repo clone in `build/` plus `tools/uklid-workspace.mjs`;
at most 5 parallel subagents; `tools/audit-stats.mjs` reports tokens and **average context per step** before/after each wave. A running audit
gets goal `C-160` (measure, clean up, continue economically, measure again). Thorough mode only by the owner (`.rezim.json`).

## 10j. Pre-start check
Every launcher (auditor and Captain) first runs `tools/preflight.mjs`: it updates Claude Code, finds every installation (PATH, native, downloaded versions, npm) and starts the newest one even if `claude` points to an old one. Multiple installations are reported with a fix. Codex roles update via npm. It warns about a pinned model (default is the self-updating alias `best`) and about a newer Auditor release. It never blocks a start.

Package updates keep tool tweaks the auditor made for the project: files the package did not change stay; otherwise they are backed up to `AUDIT/_nastroje-zaloha/` with a task to re-apply. Local tweaks belong in `tools/mistni/`.

## 11. FAQ

**Do I have to shut anything down before the audit?** No. Only a Captain started before the installation should finish and be restarted —
guards load at session start.

**The auditor runs for a long time. Is that normal?** Yes, but it works in parallel: independent areas run as subagents launched together,
the screen crawl and probes are split into concurrent batches (default cap ~10 subagents). On a larger app it is still hours. Progress is visible
in its window and in `AUDIT/_prubeh.md`.

**The Captain reports "Blocked".** That is the gate, not an error: the Captain may not change hooks or verdicts, nor ship without a gate.
Rules are tuned by narrowing, not by bypassing.

**Can I ship with a red gate?** Technically yes — `git commit --no-verify`, delete the hook — and that is exactly what the auditor finds on
the next audit and records as P0 (gate bypass). The gate protects you from your own impatience too; that is its point.

**Why does the auditor run on the most expensive model?** Because it does judgment: what is a real defect, when "done" is false, which
verdict to issue. A weaker model there does not mean slower work — it means worse decisions. Mechanics (crawling screens, scans) stay on
cheap models.

**Why is the tool in Czech?** It was built by a Czech product owner for his own projects and published because the approach is general.
The code is language-neutral; the agent's prompts, checklists and installer messages are Czech. An English layer is the first thing the
community can contribute.
