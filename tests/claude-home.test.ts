import { describe, expect, test } from "bun:test"
import { promises as fs } from "fs"
import os from "os"
import path from "path"
import { loadClaudeHome } from "../src/parsers/claude-home"

describe("loadClaudeHome", () => {
  test("loads personal skills, commands, and MCP servers", async () => {
    const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "claude-home-"))
    const skillDir = path.join(tempHome, "skills", "reviewer")
    const commandsDir = path.join(tempHome, "commands")

    await fs.mkdir(skillDir, { recursive: true })
    await fs.writeFile(path.join(skillDir, "SKILL.md"), "---\nname: reviewer\n---\nReview things.\n")

    await fs.mkdir(path.join(commandsDir, "workflows"), { recursive: true })
    await fs.writeFile(
      path.join(commandsDir, "workflows", "plan.md"),
      "---\ndescription: Planning command\nargument-hint: \"[feature]\"\n---\nPlan the work.\n",
    )
    await fs.writeFile(
      path.join(commandsDir, "custom.md"),
      "---\nname: custom-command\ndescription: Custom command\nallowed-tools: Bash, Read\n---\nDo custom work.\n",
    )

    await fs.writeFile(
      path.join(tempHome, "settings.json"),
      JSON.stringify({
        mcpServers: {
          context7: { url: "https://mcp.context7.com/mcp" },
        },
      }),
    )

    const config = await loadClaudeHome(tempHome)

    expect(config.skills.map((skill) => skill.name)).toEqual(["reviewer"])
    expect(config.commands?.map((command) => command.name)).toEqual([
      "custom-command",
      "workflows:plan",
    ])
    expect(config.commands?.find((command) => command.name === "workflows:plan")?.argumentHint).toBe("[feature]")
    expect(config.commands?.find((command) => command.name === "custom-command")?.allowedTools).toEqual(["Bash", "Read"])
    expect(config.mcpServers.context7?.url).toBe("https://mcp.context7.com/mcp")
  })
})
