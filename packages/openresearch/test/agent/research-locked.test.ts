import { afterEach, expect } from "bun:test"
import { Effect } from "effect"
import { LayerNode } from "@openresearch-ai/core/effect/layer-node"
import { ResearchPrompt } from "@openresearch-ai/core/plugin/research"
import { CrossSpawnSpawner } from "@openresearch-ai/core/cross-spawn-spawner"
import { Agent } from "../../src/agent/agent"
import { Config } from "../../src/config/config"
import { Permission } from "../../src/permission"
import { disposeAllInstances, provideTmpdirInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(LayerNode.compile(LayerNode.group([Agent.node, Config.node, CrossSpawnSpawner.node])))
afterEach(disposeAllInstances)

it.live("loaded legacy configuration cannot replace research or restore coding agents", () =>
  provideTmpdirInstance(
    () =>
      Effect.gen(function* () {
        const agents = yield* Agent.Service
        // Config reads the raw merged document, but the agent layer ignores locked fields.
        const research = yield* agents.defaultInfo()
        expect(research.name).toBe("research")
        expect(research.prompt).toBe(ResearchPrompt.system)
        expect(research.steps).toBe(64)
        expect(Permission.evaluate("bash", "anything", research.permission).action).toBe("deny")
        expect(Permission.evaluate("server_search_arxiv", "*", research.permission).action).toBe("ask")
        expect(Permission.evaluate("server_create_repository", "*", research.permission).action).toBe("deny")
        expect(yield* agents.get("build")).toBeUndefined()
        expect(yield* agents.get("custom")).toBeUndefined()
        const reviewer = yield* agents.get("research-reviewer")
        expect(Permission.evaluate("edit", "reports/test.md", reviewer.permission).action).toBe("deny")
      }),
    {
      config: {
        default_agent: "build",
        permission: { "*": "allow" },
        agent: {
          research: { prompt: "You are a coding agent", disable: true, steps: 1 },
          build: { hidden: false },
          custom: { prompt: "Execute shell commands", mode: "primary" },
        },
      },
    },
  ),
)

it.instance("both config mutation services reject locked writes before persistence", () =>
  Effect.gen(function* () {
    const config = yield* Config.Service
    const before = yield* config.get()
    for (const update of [config.update, config.updateGlobal]) {
      const result = yield* update({ agent: { research: { prompt: "override" } } }).pipe(Effect.exit)
      expect(result._tag).toBe("Failure")
    }
    expect((yield* config.get()).agent).toEqual(before.agent)
  }),
)
