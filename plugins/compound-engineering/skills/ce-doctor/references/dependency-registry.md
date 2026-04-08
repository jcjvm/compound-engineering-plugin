# Dependency Registry

Centralized registry of external dependencies used by compound-engineering skills and agents. Each entry contains the metadata needed for `/ce-doctor` diagnostics and `/ce-setup` guided installation.

To add a new dependency, add a new section following the format below. No code changes to doctor or setup are needed.

---

## CLI Dependencies (Recommended)

These are pre-selected during `/ce-setup`. Most users should install them.

### agent-browser

- **Description:** Browser automation CLI for testing, screenshots, and web interaction
- **Tier:** recommended
- **Check:** `command -v agent-browser`
- **Install:** `npm install -g agent-browser && agent-browser install`
- **Project:** https://github.com/nichochar/agent-browser
- **Used by:** test-browser, feature-video, reproduce-bug, ce-review, design-iterator, figma-design-sync
- **Env vars:** AGENT_BROWSER_HEADED (optional, enables headed mode), AGENT_BROWSER_DEFAULT_TIMEOUT (optional, override timeout in ms)

### gh

- **Description:** GitHub CLI for issues, PRs, and repo management
- **Tier:** recommended
- **Check:** `command -v gh`
- **Install:** `brew install gh`
- **Project:** https://cli.github.com
- **Used by:** issue-intelligence-analyst, resolve-pr-parallel, test-browser, report-bug-ce, ce-plan, ce-review, ce-work, feature-video
- **Fallback:** GitHub MCP server if available

### jq

- **Description:** Command-line JSON processor
- **Tier:** recommended
- **Check:** `command -v jq`
- **Install:** `brew install jq`
- **Project:** https://jqlang.github.io/jq/
- **Used by:** ce-plan, ce-brainstorm, proof, deploy-docs, orchestrating-swarms, resolve-pr-parallel

---

## CLI Dependencies (Optional)

These are opt-in during `/ce-setup`. Install if you use the related skills.

### rtk

- **Description:** Token-optimized CLI proxy for dev operations (60-90% token savings)
- **Tier:** optional
- **Check:** `command -v rtk`
- **Install options:**
  - `brew install rtk` (macOS with Homebrew)
  - `curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh` (Linux/macOS)
  - `cargo install --git https://github.com/rtk-ai/rtk` (Rust toolchain)
- **Project:** https://github.com/rtk-ai/rtk
- **Used by:** General token optimization across all skills
- **Post-install:** Run `rtk init --global` then restart the agent session
- **Platforms:** Claude Code, Gemini CLI, OpenCode only (requires pre-tool hooks)

### ffmpeg

- **Description:** Media processing CLI for video/GIF creation from screenshots
- **Tier:** optional
- **Check:** `command -v ffmpeg`
- **Install:** `brew install ffmpeg`
- **Project:** https://ffmpeg.org
- **Used by:** feature-video

---

## External Services (Detect-Only)

These cannot be auto-installed. doctor reports their status as informational guidance.

### Figma MCP

- **Description:** MCP server for accessing Figma designs
- **Tier:** detect-only
- **Check MCP:** Attempt to use a Figma MCP tool. If available in the current session, the server is loaded.
- **Project:** https://github.com/nichochar/figma-mcp (or equivalent Figma MCP server)
- **Used by:** figma-design-sync, design-implementation-reviewer
- **Note:** Requires Figma account and MCP server configuration. Cannot be auto-installed.

### XcodeBuildMCP

- **Description:** MCP server for iOS simulator build and test
- **Tier:** detect-only
- **Check MCP:** Attempt to use an XcodeBuildMCP tool. If available in the current session, the server is loaded.
- **Project:** https://github.com/nichochar/XcodeBuildMCP (or equivalent)
- **Used by:** test-xcode
- **Note:** Requires Xcode installed on macOS. Cannot be auto-installed.

---

## Environment Variables

These are checked independently and also prompted per-dependency when relevant.

### GEMINI_API_KEY

- **Description:** Google Gemini API key for image generation and DSPy.rb
- **Check:** Check if the variable is set in the current environment
- **Related dep:** gemini-imagegen, dspy-ruby
- **How to get:** Create at https://aistudio.google.com/apikey
- **Persistence guidance:** Add to shell profile (`~/.zshrc` or `~/.bashrc`) or agent settings
