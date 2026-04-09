# Upload and Approval

Get user approval for the local artifact, upload evidence to a public URL, and generate markdown for PR inclusion.

## Step 1: Local Approval Gate

Before uploading anywhere public, present the local artifact path to the user for approval. Use the platform's blocking question tool (`AskUserQuestion` in Claude Code, `request_user_input` in Codex, `ask_user` in Gemini).

**Question:** "Evidence captured at [RUN_DIR]/[artifact]. Review it locally and decide:"

**Options:**
1. **Looks good, upload for PR** -- proceed to upload
2. **Not good enough, try again** -- return to the tier execution step and re-capture
3. **Skip evidence for this PR** -- set evidence to null and proceed

If the question tool is unavailable (headless/background mode), present the numbered options and wait for the user's reply before proceeding.

## Step 2: Upload to catbox.moe

After the user approves the local artifact, upload the evidence file (GIF or PNG) using the capture pipeline script. Set `ARTIFACT_PATH` to the approved GIF or PNG path:

```bash
bash scripts/capture-evidence.sh upload [ARTIFACT_PATH]
```

The script uploads to catbox.moe, validates the response starts with `https://`, and retries once on failure. The last line of output is the public URL (e.g., `https://files.catbox.moe/abc123.gif`).

**If upload fails** after retry, fall back to committing evidence to the PR branch:
```bash
mkdir -p docs/evidence
cp [ARTIFACT_PATH] docs/evidence/[ARTIFACT_FILE_NAME]
git add docs/evidence/[ARTIFACT_FILE_NAME]
git commit -m "Add evidence for PR"
git push
```
Use the relative path `docs/evidence/[ARTIFACT_FILE_NAME]` as the image URL in the PR description. GitHub renders images committed to the branch once pushed.

For multiple files (static screenshots tier), upload each file separately.

## Step 3: Generate Markdown Embed

Based on the evidence label and URL, generate the markdown for PR inclusion:

**For GIF evidence (Demo label):**
```markdown
## Demo

![Demo]([URL])
```

**For static screenshots (Screenshots label):**
```markdown
## Screenshots

![Before]([URL-1])
![After]([URL-2])
```

**For skipped evidence:**
Return empty string. No section added to PR.

## Step 4: Cleanup

Remove the `[RUN_DIR]` scratch directory and all temporary files. Preserve nothing -- the evidence lives at the public URL now.

If evidence was committed to the branch (catbox fallback), do not delete the committed files.
