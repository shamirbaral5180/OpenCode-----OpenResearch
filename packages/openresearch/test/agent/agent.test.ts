import { afterEach, expect } from "bun:test"
import { Effect } from "effect"
import { LayerNode } from "@openresearch-ai/core/effect/layer-node"
import path from "path"
import { mkdir } from "fs/promises"
import { disposeAllInstances, provideInstance, TestInstance } from "../fixture/fixture"
import { InstanceState } from "../../src/effect/instance-state"
import { testEffect } from "../lib/effect"
import { Agent } from "../../src/agent/agent"
import { Auth } from "../../src/auth"
import { Config } from "../../src/config/config"
import { RuntimeFlags } from "../../src/effect/runtime-flags"
import { Global } from "@openresearch-ai/core/global"
import { Permission } from "../../src/permission"
import { PermissionV1 } from "@openresearch-ai/core/v1/permission"
import { Plugin } from "../../src/plugin"
import { Provider } from "../../src/provider/provider"
import { Skill } from "../../src/skill"
import { Truncate } from "../../src/tool/truncate"
import { ResearchPrompt } from "@openresearch-ai/core/plugin/research"
import { deriveSubagentSessionPermission } from "../../src/agent/subagent-permissions"

const agentLayer = (flags: Partial<RuntimeFlags.Info> = {}) =>
  LayerNode.compile(
    LayerNode.group([Agent.node, Plugin.node, Provider.node, Auth.node, Config.node, Skill.node, RuntimeFlags.node]),
    [[RuntimeFlags.node, RuntimeFlags.layer(flags)]],
  )

const it = testEffect(agentLayer())

function evalPerm(agent: Agent.Info | undefined, permission: string): PermissionV1.Action | undefined {
  if (!agent) return undefined
  return Permission.evaluate(permission, "*", agent.permission).action
}

function load<A>(fn: (svc: Agent.Interface) => Effect.Effect<A>) {
  return Agent.Service.use(fn)
}

afterEach(async () => {
  await disposeAllInstances()
})

const RESEARCH_AGENTS = ["research", "research-scout", "research-reviewer", "research-redteam"] as const
const INTERNAL_AGENTS = ["compaction", "title", "summary"] as const

it.instance("exposes only the locked research agents", () =>
  Effect.gen(function* () {
    const names = (yield* load((svc) => svc.list())).map((agent) => agent.name)
    expect(names).toEqual(expect.arrayContaining([...RESEARCH_AGENTS, ...INTERNAL_AGENTS]))
    for (const removed of ["build", "plan", "general", "explore"]) {
      expect(names).not.toContain(removed)
      expect(yield* load((svc) => svc.get(removed))).toBeUndefined()
    }
  }),
)

it.instance("research is the default and only visible primary agent", () =>
  Effect.gen(function* () {
    expect(yield* load((svc) => svc.defaultAgent())).toBe("research")
    const info = yield* load((svc) => svc.defaultInfo())
    expect(info.name).toBe("research")
    expect(info.mode).toBe("primary")
    const visible = (yield* load((svc) => svc.list())).filter((agent) => agent.mode !== "subagent" && !agent.hidden)
    expect(visible.map((agent) => agent.name)).toEqual(["research"])
  }),
)

it.instance("research agents ignore user attempts to override prompt, steps, and permissions", () =>
  Effect.gen(function* () {
    const research = yield* load((svc) => svc.get("research"))
    expect(research?.prompt).toBe(ResearchPrompt.system)
    expect(research?.steps).toBe(ResearchPrompt.steps)
    expect(evalPerm(research, "bash")).toBe("deny")
    expect(evalPerm(research, "webfetch")).toBe("allow")
    expect(evalPerm(research, "server_search_arxiv")).toBe("ask")
    expect(evalPerm(research, "resolve_doi")).toBe("ask")
    expect(Permission.evaluate("edit", "src/index.ts", research!.permission).action).toBe("deny")
  }),
)

it.instance(
  "research agent ignores a config prompt override",
  () =>
    Effect.gen(function* () {
      const research = yield* load((svc) => svc.get("research"))
      expect(research?.prompt).toBe(ResearchPrompt.system)
      expect(research?.steps).toBe(ResearchPrompt.steps)
    }),
  {
    config: {
      default_agent: "build",
      agent: {
        research: { prompt: "You are a coding agent", steps: 1, temperature: 2 },
        build: { hidden: false },
        custom: { prompt: "Execute shell commands", mode: "primary" },
      },
    },
  },
)

it.instance(
  "custom and coding agents from config cannot be restored",
  () =>
    Effect.gen(function* () {
      expect(yield* load((svc) => svc.get("custom"))).toBeUndefined()
      const names = (yield* load((svc) => svc.list())).map((agent) => agent.name)
      expect(names).not.toContain("custom")
    }),
  { config: { agent: { custom: { prompt: "Execute shell commands", mode: "primary" } } } },
)

it.instance("research reviewer, scout, and redteam are read-only subagents", () =>
  Effect.gen(function* () {
    for (const name of ["research-scout", "research-reviewer", "research-redteam"]) {
      const agent = yield* load((svc) => svc.get(name))
      expect(agent?.mode).toBe("subagent")
      expect(agent?.prompt).toContain(ResearchPrompt.system)
      expect(evalPerm(agent, "edit")).toBe("deny")
      expect(evalPerm(agent, "bash")).toBe("deny")
      expect(Permission.evaluate("task", "research-reviewer", agent!.permission).action).toBe("deny")
      expect(Permission.evaluate("task", "*", agent!.permission).action).toBe("deny")
    }
  }),
)

it.instance("research agent may delegate only to scout, reviewer, and redteam", () =>
  Effect.gen(function* () {
    const research = yield* load((svc) => svc.get("research"))
    for (const target of ["research-scout", "research-reviewer", "research-redteam"]) {
      expect(Permission.evaluate("task", target, research!.permission).action).toBe("allow")
    }
    for (const target of ["general", "explore", "build", "plan", "custom"]) {
      expect(Permission.evaluate("task", target, research!.permission).action).toBe("deny")
    }
  }),
)

it.instance("internal agents deny all permissions", () =>
  Effect.gen(function* () {
    for (const name of INTERNAL_AGENTS) {
      const agent = yield* load((svc) => svc.get(name))
      expect(agent).toBeDefined()
      expect(agent?.hidden).toBe(true)
      for (const permission of ["bash", "edit", "read", "webfetch"]) {
        expect(evalPerm(agent, permission)).toBe("deny")
      }
    }
    expect((yield* load((svc) => svc.get("compaction")))?.prompt).toContain(ResearchPrompt.compaction)
  }),
)

it.instance("external_directory stays gated for research agents", () =>
  Effect.gen(function* () {
    const research = yield* load((svc) => svc.get("research"))
    // Only the truncation glob is whitelisted; all other external paths are requested.
    expect(Permission.evaluate("external_directory", Truncate.GLOB, research!.permission).action).toBe("allow")
    expect(
      Permission.evaluate("external_directory", path.join(Global.Path.tmp, "scratch"), research!.permission).action,
    ).toBe("ask")
  }),
)

it.instance("subagents do not inherit parent permissions to widen access", () =>
  Effect.gen(function* () {
    for (const name of ["research-scout", "research-reviewer", "research-redteam"]) {
      const agent = yield* load((svc) => svc.get(name))
      const session = deriveSubagentSessionPermission({ parentSessionPermission: [], subagent: agent! })
      expect(Permission.evaluate("edit", "reports/evidence.md", agent!.permission, session).action).toBe("deny")
      expect(Permission.evaluate("bash", "echo unsafe", agent!.permission, session).action).toBe("deny")
      expect(Permission.evaluate("task", "general", agent!.permission, session).action).toBe("deny")
    }
  }),
)

it.instance("Agent.get returns undefined for a non-existent agent", () =>
  Effect.gen(function* () {
    expect(yield* load((svc) => svc.get("does_not_exist"))).toBeUndefined()
  }),
)

for (const workspace of ["git root", "git subdirectory", "nonGit"] as const) {
  it.instance(
    `research report permissions use worktree-relative resources in ${workspace} (${process.platform})`,
    () =>
      Effect.gen(function* () {
        const root = yield* TestInstance
        const directory =
          workspace === "git subdirectory" ? path.join(root.directory, "nested", "workspace") : root.directory
        yield* Effect.promise(() => mkdir(directory, { recursive: true }))
        yield* Effect.gen(function* () {
          const ctx = yield* InstanceState.context
          expect(ctx.directory).toBe(directory)
          if (workspace === "git root") expect(ctx.worktree).toBe(directory)
          if (workspace === "git subdirectory") expect(ctx.worktree).toBe(root.directory)
          if (workspace === "nonGit") expect(ctx.worktree).not.toBe(directory)
          for (const name of RESEARCH_AGENTS) {
            const agent = yield* load((svc) => svc.get(name))
            const resource = path.relative(ctx.worktree, path.join(directory, "reports", "topic", "evidence.md"))
            for (const file of [resource, resource.replaceAll("\\", "/"), resource.replaceAll("/", "\\")]) {
              expect(Permission.evaluate("edit", file, agent!.permission).action).toBe(
                name === "research" ? "allow" : "deny",
              )
            }
            for (const file of [
              path.join(directory, "src", "index.ts"),
              path.join(directory, "reports-other", "evidence.md"),
              path.join(directory, "..", "reports", "evidence.md"),
            ]) {
              expect(Permission.evaluate("edit", path.relative(ctx.worktree, file), agent!.permission).action).toBe(
                "deny",
              )
            }
            if (name === "research") {
              const rule = agent!.permission.find((rule) => rule.permission === "edit" && rule.action === "allow")
              expect(rule?.pattern).toBe(
                `${path.relative(ctx.worktree, path.join(directory, "reports")).replaceAll("\\", "/")}/**`,
              )
              expect(rule?.pattern).not.toContain("\\")
              if (directory !== ctx.worktree)
                expect(Permission.evaluate("edit", "reports/evidence.md", agent!.permission).action).toBe("deny")
            }
          }
        }).pipe(provideInstance(directory))
      }),
    { git: workspace !== "nonGit" },
  )
}
