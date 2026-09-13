import { describe, expect, test } from "bun:test"
import { ResearchPolicy } from "@openresearch-ai/core/v1/research-policy"
import { ResearchPrompt } from "@openresearch-ai/core/plugin/research"
import { ConfigV1 } from "@openresearch-ai/core/v1/config/config"
import { Schema } from "effect"

describe("research configuration lock", () => {
  test("normalizes legacy overrides without mutating saved input", () => {
    const config = {
      model: "provider/model",
      default_agent: "build",
      instructions: ["override.md"],
      permission: { "*": "allow" as const },
      agent: { research: { prompt: "code instead", disable: true, steps: 1 }, build: { hidden: false } },
      compaction: { auto: false, prune: true },
      skills: { urls: ["https://example.org/override"] },
    }
    const effective = ResearchPolicy.effective(config)
    expect(Schema.is(ConfigV1.Info)(effective)).toBe(true)
    expect(effective.default_agent).toBe("research")
    expect(effective.agent?.research?.prompt).toBe(ResearchPrompt.system)
    expect(effective.agent?.build).toBeUndefined()
    expect(effective.instructions).toEqual([])
    expect(effective.skills).toEqual({ paths: [], urls: [] })
    expect(effective.compaction).toEqual(ResearchPrompt.compactionSettings)
    expect(effective.model).toBe("provider/model")
    expect(config.agent.research.prompt).toBe("code instead")
  })

  test("rejects locked writes but allows connection and appearance settings", () => {
    for (const patch of [
      { agent: {} },
      { mode: {} },
      { default_agent: "build" },
      { instructions: [] },
      { permission: { "*": "allow" as const } },
      { tools: {} },
      { compaction: {} },
      { skills: {} },
    ])
      expect(() => ResearchPolicy.assertWritable(patch)).toThrow("read-only")
    expect(() => ResearchPolicy.assertWritable({ model: "provider/model", username: "researcher" })).not.toThrow()
  })

  test("returns fresh policy objects that cannot alter subsequent reads", () => {
    const first = ResearchPolicy.effective({})
    first.agent!.research!.prompt = "changed"
    first.compaction!.auto = false
    expect(ResearchPolicy.effective({}).agent?.research?.prompt).toBe(ResearchPrompt.system)
    expect(ResearchPolicy.effective({}).compaction?.auto).toBe(true)
  })
})

describe("multi-agent orchestration policy", () => {
  test("exposes planner, scout, reviewer, and redteam roles", () => {
    for (const name of ["research", "research-scout", "research-reviewer", "research-redteam"]) {
      expect(ResearchPrompt.isResearch(name)).toBe(true)
      expect((ResearchPrompt.agents as readonly string[]).includes(name)).toBe(true)
    }
    expect((ResearchPrompt.agents as readonly string[]).includes("research-planner")).toBe(false)
  })

  test("redteam prompt frames an adversarial falsification role", () => {
    const prompt = ResearchPrompt.prompt("research-redteam")
    expect(prompt).toContain("adversarial")
    expect(prompt).toContain("falsify")
    expect(prompt).toContain("Do not write files or delegate")
  })

  test("primary research allows delegating to redteam but subagents cannot delegate", () => {
    const primary = ResearchPolicy.permissions()
    expect(primary.task).toMatchObject({ "research-redteam": "allow" })
    const readonly = ResearchPolicy.permissions("reports/**", true)
    expect(readonly.task).toBe("deny")
  })

  test("exposes bounded orchestration defaults", () => {
    expect(ResearchPrompt.orchestration.maxConcurrentWorkers).toBeGreaterThan(0)
    expect(ResearchPrompt.orchestration.subagentDepth).toBeGreaterThan(0)
    expect(ResearchPrompt.orchestration.defaultBudgetUsd).toBeGreaterThan(0)
  })
})
