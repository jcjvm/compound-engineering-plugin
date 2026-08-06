# Resolving the knowledge store

`docs/solutions/` is this workflow's **default**, not a universal fact. A project may already keep its documented learnings somewhere else, under a different layout, with post-write steps of its own. Writing to the default when the project uses another path does not fail loudly — it creates a second, near-empty store that no index renders and no search reaches. The entry is written, the run reports success, and the learning is invisible.

Resolve the store **before** searching it or writing to it, and carry the result through the whole run.

## Procedure

1. **A declared store wins.** Read the root instruction file (`CLAUDE.md` or `AGENTS.md`; if one is a shim that `@`-includes the other, read the substantive one). If it names where documented solutions live, that is the store — even when the path is unusual. This is a semantic read, not a string match: the path may be described in an architecture tree, a documentation section, or ordinary prose.

2. **Otherwise probe the filesystem**, first match wins:
   - `docs/wiki/solutions/`
   - `docs/solutions/`
   - `docs/learnings/`

   A directory counts only if it exists and contains at least one `.md` file.

3. **Otherwise fall back** to `docs/solutions/` with category subdirectories, per `references/yaml-schema.md`.

## What to carry forward

Resolution produces four values. Pass all of them into every subagent prompt that reads or writes the store — subagents cannot re-derive them and will otherwise assume the default.

| Value | Meaning | Default |
|---|---|---|
| `store_path` | Directory holding entries | `docs/solutions/` |
| `layout` | `category-subdirs` or `flat` | `category-subdirs` |
| `entry_extras` | Per-entry content the project requires beyond frontmatter (e.g. index pointer comments) | none |
| `post_write` | Command(s) to run after writing (e.g. an index generator) | none |

Read `layout`, `entry_extras`, and `post_write` from the same instruction file that declared the store. When probing found the store instead, look for a documented convention near it (a `README.md` in the wiki root, an existing entry to pattern-match) before assuming the defaults.

## Rules

- **Never create a second store.** If step 1 or 2 found one, write into it. A missing category subdirectory may be created; a new store root may not.
- **`category` is always written to frontmatter.** Whether it also becomes a directory is decided by `layout` — under `flat`, entries sit directly in `store_path` and `category` stays metadata only.
- **`post_write` is part of the deliverable, not an optional extra.** A project that generates its index from entry content has an entry that is not yet discoverable until the generator runs. Run it, and report it in the output.
- **Report the resolved store** in the run's output so the user can see where the entry landed and correct a wrong guess.

## Worked example

A repo whose `CLAUDE.md` says entries live flat in `docs/wiki/solutions/`, each carrying two index-pointer comments, with `pnpm wiki:generate` rebuilding the catalogs:

```
store_path:   docs/wiki/solutions/
layout:       flat
entry_extras: <!-- index-short: … --> and <!-- index: … --> lines under the frontmatter
post_write:   pnpm wiki:generate
```

The entry is written to `docs/wiki/solutions/<filename>.md` — not `docs/wiki/solutions/<category>/` and not `docs/solutions/<category>/` — carries both comment lines, and the run ends by executing `pnpm wiki:generate`.
