---
name: claude-permissions-optimizer
context: fork
description: Optimize Claude Code permissions by finding safe Bash commands from session history and auto-applying them to settings.json. Claude Code only -- do NOT trigger in Gemini CLI, Codex, Cursor, or other non-Claude Code environments. Use when experiencing permission fatigue, too many permission prompts, wanting to optimize permissions, or needing to set up allowlists. Triggers on "optimize permissions", "reduce permission prompts", "allowlist commands", "too many permission prompts", "permission fatigue", "permission setup", or complaints about clicking approve too often.
---

# Claude Permissions Optimizer

Find safe Bash commands that are causing unnecessary permission prompts and auto-allow them in `settings.json` -- evidence-based, not prescriptive.

This skill identifies commands safe to auto-allow based on actual session history. It does not handle requests to allowlist specific dangerous commands. If the user asks to allow something destructive (e.g., `rm -rf`, `git push --force`), explain that this skill optimizes for safe commands only, and that manual allowlist changes can be made directly in settings.json.

## Pre-check: Verify Claude Code environment

Confirm `~/.claude/` (or `$CLAUDE_CONFIG_DIR`) exists. If not, or if the environment is clearly a different agent, stop and tell the user:

> "This skill optimizes Claude Code permissions by analyzing session history and updating settings.json. It doesn't apply to other coding agents. For permission configuration in [detected agent], check that agent's docs."

## Step 1: Choose Analysis Scope

Ask the user how broadly to analyze using `AskUserQuestion`.

1. **This project only** -- sessions for the current working directory
2. **All projects** -- sessions across every project
3. **Custom** -- user specifies constraints (time window, session count, etc.)

Default to **This project only** if the prompt mentions "this project." Default to **All projects** if general (e.g., "optimize permissions"). The script analyzes all available sessions by default -- no arbitrary time cutoff.

## Step 2: Run Extraction Script

Run the bundled script. It handles everything: loads the current allowlist, scans recent session transcripts (most recent 200 sessions or last 30 days, whichever is more restrictive), filters already-covered commands, applies a min-count threshold (5+), normalizes into `Bash(pattern)` rules, and pre-classifies each as safe/review/dangerous.

**All projects:**
```bash
node <skill-dir>/scripts/extract-commands.mjs
```

**This project only** -- pass the project slug (absolute path with every non-alphanumeric char replaced by `-`, e.g., `/Users/tmchow/Code/my-project` becomes `-Users-tmchow-Code-my-project`):
```bash
node <skill-dir>/scripts/extract-commands.mjs --project-slug <slug>
```

Optional: `--days <N>` to limit to the last N days. Omit to analyze all available sessions.

The output JSON has:
- `green`: safe patterns to recommend `{ pattern, count, sessions, examples }`
- `yellowFootnote`: one-line summary of frequently-used commands that aren't safe to auto-allow (or null)
- `stats`: `totalExtracted`, `alreadyCovered`, `belowThreshold`, `patternsReturned`, etc.

The model's job is to **present** the script's output, not re-classify.

If the script returns empty results, tell the user their allowlist is already well-optimized or they don't have enough session history yet -- suggest re-running after a few more working sessions.

## Step 3: Present Results

Present in three parts. Keep the formatting clean and scannable.

### Part 1: Analysis summary

Show the work done using the script's `stats`. Reaffirm the scope. Keep it to 4-5 lines.

**Example:**
```
## Analysis (compound-engineering-plugin)

Scanned **24 sessions** for this project.
Found **312 unique Bash commands** across those sessions.

- **245** already covered by your 43 existing allowlist rules (79%)
- **61** used fewer than 5 times (filtered as noise)
- **6 commands** remain that regularly trigger permission prompts
```

### Part 2: Recommendations

Present `green` patterns as a numbered table. If `yellowFootnote` is not null, include it as a line after the table.

```
### Safe to auto-allow
| # | Pattern | Evidence |
|---|---------|----------|
| 1 | `Bash(bun test *)` | 23 uses across 8 sessions |
| 2 | `Bash(bun run *)` | 18 uses, covers dev/build/lint scripts |
| 3 | `Bash(node *)` | 12 uses across 5 sessions |

Also frequently used: bun install, mkdir (not classified as safe to auto-allow but may be worth reviewing)
```

### Part 3: Bottom line

1-2 short sentences max. Lead with the number of rules. Do NOT list individual patterns here -- the table above already shows them. Keep this section extremely brief because the `AskUserQuestion` UI that follows will visually truncate any long text.

```
Adding **19 rules** would cover your remaining high-frequency permission prompts. The biggest win is `Bash(pnpm --filter * build *)` at 128 uses.
```

## Step 4: Get User Confirmation

The recommendations table is already displayed. Use `AskUserQuestion` for the simple decision:

1. **Apply all to user settings** (`~/.claude/settings.json`)
2. **Apply all to project settings** (`.claude/settings.json`)
3. **Skip**

If the user wants to exclude specific items, they can reply in free text (e.g., "all except 3 and 7 to user settings"). The numbered table is already visible for reference -- no need to re-list items in the question tool.

## Step 5: Apply to Settings

For each target settings file:

1. Read the current file (create `{ "permissions": { "allow": [] } }` if it doesn't exist)
2. Append new patterns to `permissions.allow`, avoiding duplicates
3. Sort the allow array alphabetically
4. Write back with 2-space indentation
5. **Verify the write** -- confirm the file wasn't corrupted:
   ```bash
   node -e "JSON.parse(require('fs').readFileSync('<path>','utf8'))"
   ```
   If this fails, the file is invalid JSON. Immediately restore from the content read in step 1 and report the error. Do not continue to other files.

After successful verification:

```
Applied N rules to ~/.claude/settings.json
Applied M rules to .claude/settings.json

These commands will no longer trigger permission prompts.
```

If `.claude/settings.json` was modified and is tracked by git, mention that committing it would benefit teammates.

## Edge Cases

- **No project context** (running outside a project): Only offer user-level settings as write target.
- **Settings file doesn't exist**: Create it with `{ "permissions": { "allow": [] } }`. For `.claude/settings.json`, also create the `.claude/` directory if needed.
- **Deny rules**: If a deny rule already blocks a command, warn rather than adding an allow rule (deny takes precedence in Claude Code).
