---
title: Classification bugs in claude-permissions-optimizer extract-commands script
category: logic-errors
date: 2026-03-18
severity: high
tags: [security, classification, normalization, permissions, command-extraction, destructive-commands, dcg]
component: claude-permissions-optimizer
symptoms:
  - Dangerous commands (find -delete, git push -f) recommended as safe to auto-allow
  - Safe/common commands (git blame, gh CLI) invisible or misclassified in output
  - 632 commands reported as below-threshold noise due to filtering before normalization
  - git restore -S (safe unstage) incorrectly classified as red (destructive)
---

# Classification Bugs in claude-permissions-optimizer

## Problem

The `extract-commands.mjs` script in the claude-permissions-optimizer skill had three categories of bugs that affected both security and UX of permission recommendations.

**Symptoms observed:** Running the skill across 200 sessions reported 632 commands as "below threshold noise" -- suspiciously high. Cross-referencing against the Destructive Command Guard (DCG) project confirmed classification gaps on both spectrums.

## Root Cause

### 1. Threshold before normalization (architectural ordering)

The min-count filter was applied to each raw command **before** normalization and grouping. Hundreds of variants of the same logical command (e.g., `git log --oneline src/foo.ts`, `git log --oneline src/bar.ts`) were each discarded individually for falling below the threshold of 5, even though their normalized form (`git log *`) had 200+ total uses.

### 2. Normalization broadens classification

Safety classification happened on the **raw** command, but the result was carried forward to the **normalized** pattern. `node --version` (green via `--version$` regex) would normalize to the dangerously broad `node *`, inheriting the green classification despite `node` being a yellow-tier base command.

### 3. Classification gaps (found via DCG cross-reference)

**Security bugs (dangerous classified as green):**
- `find` unconditionally in `GREEN_BASES` -- `find -delete` and `find -exec rm` passed as safe
- `git push -f` regex required `-f` after other args, missed `-f` immediately after `push`
- `git restore -S` falsely red (lookahead only checked `--staged`, not the `-S` alias)
- `git clean -fd` regex required `f` at end of flag group, missed `-fd` (f then d)
- `git checkout HEAD -- file` pattern didn't allow a ref between `checkout` and `--`
- `git branch --force` not caught alongside `-D`
- Missing RED patterns: `npm unpublish`, `cargo yank`, `dd of=`, `mkfs`, `pip uninstall`, `apt remove/purge`, `brew uninstall`, `git reset --merge`

**UX bugs (safe commands misclassified):**
- `git blame`, `git shortlog` -> unknown (missing from GREEN_COMPOUND)
- `git tag -l`, `git stash list/show` -> yellow instead of green
- `git clone` -> unknown (not in any YELLOW pattern)
- All `gh` CLI commands -> unknown (no patterns at all)
- `git restore --staged/-S` -> red instead of yellow

## Solution

### Fix 1: Reorder the pipeline

Normalize and group commands first, then apply the min-count threshold to the grouped totals:

```javascript
// Group ALL non-allowed commands by normalized pattern first
for (const [command, data] of commands) {
  if (isAllowed(command)) { alreadyCovered++; continue; }
  const pattern = "Bash(" + normalize(command) + ")";
  // ... group by pattern, merge sessions, escalate tiers
}

// THEN filter by min-count on GROUPED totals
for (const [pattern, data] of patternGroups) {
  if (data.totalCount < minCount) {
    belowThreshold += data.rawCommands.length;
    patternGroups.delete(pattern);
  }
}
```

### Fix 2: Post-grouping safety reclassification

After grouping, re-classify the normalized pattern itself. If the broader form maps to a more restrictive tier, escalate:

```javascript
for (const [pattern, data] of patternGroups) {
  if (data.tier !== "green") continue;
  if (!pattern.includes("*")) continue;
  const cmd = pattern.replace(/^Bash\(|\)$/g, "");
  const { tier, reason } = classify(cmd);
  if (tier === "red") { data.tier = "red"; data.reason = reason; }
  else if (tier === "yellow") { data.tier = "yellow"; }
  else if (tier === "unknown") { data.tier = "unknown"; }
}
```

### Fix 3: Patch classification gaps

Key regex fixes:

```javascript
// find: removed from GREEN_BASES; destructive forms caught by RED
{ test: /\bfind\b.*\s-delete\b/, reason: "find -delete permanently removes files" },
{ test: /\bfind\b.*\s-exec\s+rm\b/, reason: "find -exec rm permanently removes files" },
// Safe find via GREEN_COMPOUND:
/^find\b(?!.*(-delete|-exec))/

// git push -f: catch -f in any position
{ test: /git\s+(?:\S+\s+)*push\s+.*-f\b/ },
{ test: /git\s+(?:\S+\s+)*push\s+-f\b/ },

// git restore: exclude both --staged and -S from red
{ test: /git\s+restore\s+(?!.*(-S\b|--staged\b))/ },
// And add yellow pattern for the safe form:
/^git\s+restore\s+.*(-S\b|--staged\b)/

// git clean: match f anywhere in combined flags
{ test: /git\s+clean\s+.*(-[a-z]*f[a-z]*\b|--force\b)/ },

// git branch: catch both -D and --force
{ test: /git\s+branch\s+.*(-D\b|--force\b)/ },
```

New GREEN_COMPOUND patterns for safe commands:

```javascript
/^git\s+(status|log|diff|show|blame|shortlog|...)\b/  // added blame, shortlog
/^git\s+tag\s+(-l\b|--list\b)/                         // tag listing
/^git\s+stash\s+(list|show)\b/                          // stash read-only
/^gh\s+(pr|issue|run)\s+(view|list|status|diff|checks)\b/  // gh read-only
/^gh\s+repo\s+(view|list|clone)\b/
/^gh\s+api\b/
```

New YELLOW_COMPOUND patterns:

```javascript
/^git\s+(...|clone)\b/           // added clone
/^gh\s+(pr|issue)\s+(create|edit|comment|close|reopen|merge)\b/  // gh write ops
```

## Verification

- Built a test suite of 70+ commands across both spectrums (dangerous and safe)
- Cross-referenced against DCG rule packs: core/git, core/filesystem, package_managers
- Final result: 0 dangerous commands classified as green, 0 safe commands misclassified
- Repo test suite: 344 tests pass

## Prevention Strategies

### Pipeline ordering is an architectural invariant

The correct pipeline order is:

```
filter(allowlist) -> normalize -> group -> threshold -> re-classify(normalized) -> output
```

The post-grouping safety check that re-classifies normalized patterns containing wildcards is load-bearing. It must never be removed or moved before the grouping step.

### GREEN_BASES requires proof of no destructive subcommands

Before adding any command to `GREEN_BASES`, verify it has NO destructive flags or modes. If in doubt, use `GREEN_COMPOUND` with explicit negative lookaheads. Commands that should never be in `GREEN_BASES`: `find`, `xargs`, `sed`, `awk`, `curl`, `wget`.

### Regex negative lookaheads must enumerate ALL flag aliases

Every flag exclusion must cover both long and short forms. For git, consult `git <subcmd> --help` for every alias. Example: `(?!.*(-S\b|--staged\b))` not just `(?!.*--staged\b)`.

### RISK_FLAGS must stay synchronized with RED_PATTERNS

Every flag in a `RED_PATTERNS` regex must have a corresponding `RISK_FLAGS` entry so normalization preserves it.

## External References

### Destructive Command Guard (DCG)

**Repository:** https://github.com/Dicklesworthstone/destructive_command_guard

DCG is a Rust-based security hook with 49+ modular security packs that classify destructive commands. Its pack-based architecture maps well to the classifier's rule sections:

| DCG Pack | Classifier Section |
|---|---|
| `core/filesystem` | RED_PATTERNS (rm, find -delete, chmod, chown) |
| `core/git` | RED_PATTERNS (force push, reset --hard, clean -f, filter-branch) |
| `strict_git` | Additional git patterns (rebase, amend, worktree remove) |
| `package_managers` | RED_PATTERNS (publish, unpublish, uninstall) |
| `system` | RED_PATTERNS (sudo, reboot, kill -9, dd, mkfs) |
| `containers` | RED_PATTERNS (--privileged, system prune, volume rm) |

DCG's rule packs are a goldmine for validating classifier completeness. When adding new command categories or modifying rules, cross-reference the corresponding DCG pack. Key packs not yet fully cross-referenced: `database`, `kubernetes`, `cloud`, `infrastructure`, `secrets`.

DCG also demonstrates smart detection patterns worth studying:
- Scans heredocs and inline scripts (`python -c`, `bash -c`)
- Context-aware (won't block `grep "rm -rf"` in string literals)
- Explicit safe-listing of temp directory operations (`rm -rf /tmp/*`)

## Related Documentation

- [Script-first skill architecture](./script-first-skill-architecture.md) -- documents the architectural pattern used by this skill; the classification bugs highlight edge cases in the script-first approach
- [Compound refresh skill improvements](./compound-refresh-skill-improvements.md) -- related skill maintenance patterns

## Testing Recommendations

Future work should add a dedicated classification test suite covering:

1. **Red boundary tests:** Every RED_PATTERNS entry with positive match AND safe variant
2. **Green boundary tests:** Every GREEN_BASES/COMPOUND with destructive flag variants
3. **Normalization safety tests:** Verify that `classify(normalize(cmd))` never returns a lower tier than `classify(cmd)`
4. **DCG cross-reference tests:** Data-driven test with one entry per DCG pack rule, asserting never-green
5. **Broadening audit:** For each green rule, generate variants with destructive flags and assert they are NOT green
