import { describe, expect, test } from "bun:test"
import { promises as fs } from "fs"
import os from "os"
import path from "path"
import { writeQwenBundle } from "../src/targets/qwen"
import type { QwenBundle } from "../src/types/qwen"

function makeBundle(mcpServers?: Record<string, { command: string }>): QwenBundle {
  return {
    config: {
      name: "test-plugin",
      version: "1.0.0",
      commands: "commands",
      skills: "skills",
      agents: "agents",
      mcpServers,
    },
    agents: [],
    commandFiles: [],
    skillDirs: [],
  }
}

describe("writeQwenBundle", () => {
  test("removes stale plugin MCP servers on re-install", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "qwen-converge-"))

    await writeQwenBundle(tempRoot, makeBundle({ old: { command: "old-server" } }))
    await writeQwenBundle(tempRoot, makeBundle({ fresh: { command: "new-server" } }))

    const result = JSON.parse(await fs.readFile(path.join(tempRoot, "qwen-extension.json"), "utf8"))
    expect(result.mcpServers.fresh).toBeDefined()
    expect(result.mcpServers.old).toBeUndefined()
  })

  test("preserves user-added MCP servers across re-installs", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "qwen-user-mcp-"))

    // User has their own MCP server alongside plugin-managed ones (tracking key present)
    await fs.writeFile(
      path.join(tempRoot, "qwen-extension.json"),
      JSON.stringify({
        name: "user-project",
        mcpServers: { "user-tool": { command: "my-tool" } },
        _compound_managed_mcp: [],
      }),
    )

    await writeQwenBundle(tempRoot, makeBundle({ plugin: { command: "plugin-server" } }))

    const result = JSON.parse(await fs.readFile(path.join(tempRoot, "qwen-extension.json"), "utf8"))
    expect(result.mcpServers["user-tool"]).toBeDefined()
    expect(result.mcpServers.plugin).toBeDefined()
  })

  test("preserves unknown top-level keys from existing config", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "qwen-preserve-"))

    await fs.writeFile(
      path.join(tempRoot, "qwen-extension.json"),
      JSON.stringify({ name: "user-project", customField: "should-survive" }),
    )

    await writeQwenBundle(tempRoot, makeBundle({ plugin: { command: "p" } }))

    const result = JSON.parse(await fs.readFile(path.join(tempRoot, "qwen-extension.json"), "utf8"))
    expect(result.customField).toBe("should-survive")
  })

  test("prunes stale servers from legacy config without tracking key", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "qwen-legacy-"))

    // Simulate old writer output: has mcpServers but no _compound_managed_mcp
    await fs.writeFile(
      path.join(tempRoot, "qwen-extension.json"),
      JSON.stringify({
        name: "old-project",
        mcpServers: { old: { command: "old-server" }, renamed: { command: "renamed-server" } },
      }),
    )

    await writeQwenBundle(tempRoot, makeBundle({ fresh: { command: "new-server" } }))

    const result = JSON.parse(await fs.readFile(path.join(tempRoot, "qwen-extension.json"), "utf8"))
    expect(result.mcpServers.fresh).toBeDefined()
    expect(result.mcpServers.old).toBeUndefined()
    expect(result.mcpServers.renamed).toBeUndefined()
    expect(result._compound_managed_mcp).toEqual(["fresh"])
  })

  test("cleans up all plugin MCP servers when bundle has none", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "qwen-zero-"))

    await writeQwenBundle(tempRoot, makeBundle({ old: { command: "old-server" } }))
    await writeQwenBundle(tempRoot, makeBundle())

    const result = JSON.parse(await fs.readFile(path.join(tempRoot, "qwen-extension.json"), "utf8"))
    expect(result.mcpServers).toBeUndefined()
    expect(result._compound_managed_mcp).toBeUndefined()
  })
})
