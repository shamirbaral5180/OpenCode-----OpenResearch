import { describe, expect } from "bun:test"
import { Effect, Exit, Scope } from "effect"
import { AgentV2 } from "@openresearch-ai/core/agent"
import { AppNodeBuilder } from "@openresearch-ai/core/effect/app-node-builder"
import { Location } from "@openresearch-ai/core/location"
import { AgentPlugin } from "@openresearch-ai/core/plugin/agent"
import { ResearchPrompt } from "@openresearch-ai/core/plugin/research"
import { PermissionV2 } from "@openresearch-ai/core/permission"
import { AbsolutePath } from "@openresearch-ai/core/schema"
import { location } from "./fixture/location"
import { testEffect } from "./lib/effect"
import { agentHost, host } from "./plugin/host"

const it = testEffect(AppNodeBuilder.build(AgentV2.node))

describe("AgentV2", () => {
  it.effect("starts without agents", () =>
    Effect.gen(function* () {
      const agent = yield* AgentV2.Service

      expect(yield* agent.all()).toEqual([])
      expect(yield* agent.get(AgentV2.ID.make("build"))).toBeUndefined()
    }),
  )

  it.effect("materializes replayable agent transforms", () =>
    Effect.gen(function* () {
      const agent = yield* AgentV2.Service
      const id = AgentV2.ID.make("reviewer")
      yield* agent.transform((editor) =>
        editor.update(id, (info) => {
          info.description = "Reviews code"
          info.mode = "subagent"
        }),
      )

      expect(yield* agent.get(id)).toMatchObject({ id, description: "Reviews code", mode: "subagent" })
      expect((yield* agent.all()).map((info) => info.id)).toEqual([id])
    }),
  )

  it.effect("rebuilds state when a transform is replaced", () =>
    Effect.gen(function* () {
      const agent = yield* AgentV2.Service
      const id = AgentV2.ID.make("reviewer")
      let description = "Old description"
      let hidden = true
      yield* agent.transform((editor) =>
        editor.update(id, (info) => {
          info.description = description
          info.hidden = hidden
        }),
      )
      description = "New description"
      hidden = false
      yield* agent.reload()

      expect(yield* agent.get(id)).toMatchObject({ description: "New description", hidden: false })
    }),
  )

  it.effect("removes a transform when its scope closes", () =>
    Effect.gen(function* () {
      const agent = yield* AgentV2.Service
      const id = AgentV2.ID.make("scoped")
      const scope = yield* Scope.make()
      yield* agent.transform((editor) => editor.update(id, () => {})).pipe(Scope.provide(scope))
      expect(yield* agent.get(id)).toBeDefined()

      yield* Scope.close(scope, Exit.void)
      expect(yield* agent.get(id)).toBeUndefined()
    }),
  )

  it.effect("applies direct agent updates", () =>
    Effect.gen(function* () {
      const agent = yield* AgentV2.Service
      const id = AgentV2.ID.make("build")

      yield* agent.transform((editor) =>
        editor.update(id, (info) => {
          info.mode = "primary"
          info.hidden = true
        }),
      )

      expect(yield* agent.get(id)).toMatchObject({ id, mode: "primary", hidden: true })
    }),
  )

  it.effect("creates agents with runtime defaults and supports direct removal", () =>
    Effect.gen(function* () {
      const agent = yield* AgentV2.Service
      const id = AgentV2.ID.make("custom")

      yield* agent.transform((editor) => editor.update(id, () => {}))
      expect(yield* agent.get(id)).toEqual(AgentV2.Info.empty(id))

      yield* agent.transform((editor) => editor.remove(id))
      expect(yield* agent.get(id)).toBeUndefined()
    }),
  )

  it.effect("does not ambiently opt built-in agents into bash", () =>
    Effect.gen(function* () {
      const agent = yield* AgentV2.Service
      yield* AgentPlugin.Plugin.effect(
        host({
          agent: agentHost(agent),
        }),
      ).pipe(
        Effect.provideService(
          Location.Service,
          Location.Service.of(location({ directory: AbsolutePath.make("/project") })),
        ),
      )

      const agents = yield* agent.all()
      expect(agents.map((item) => String(item.id)).sort()).toEqual([
        "build",
        "compaction",
        "explore",
        "general",
        "plan",
        "research",
        "research-reviewer",
        "research-scout",
        "summary",
        "title",
      ])
      for (const item of agents) {
        expect(item.permissions.some((rule) => rule.action === "bash" && rule.effect !== "deny")).toBe(false)
      }
      expect((yield* agent.default())?.id).toBe(AgentV2.ID.make("research"))
      expect(agents.filter((item) => item.mode !== "subagent" && !item.hidden).map((item) => String(item.id))).toEqual([
        "research",
      ])
      expect((yield* agent.resolve("build"))?.system).toContain("coding agent")
      expect((yield* agent.resolve("plan"))?.mode).toBe("primary")
      for (const name of ["research", "research-scout", "research-reviewer"]) {
        const item = (yield* agent.resolve(name))!
        expect(item.system).toContain(ResearchPrompt.system)
        expect(PermissionV2.evaluate("bash", "*", item.permissions).effect).toBe("deny")
        expect(PermissionV2.evaluate("connected_search", "*", item.permissions).effect).toBe("ask")
        expect(PermissionV2.evaluate("edit", "src/index.ts", item.permissions).effect).toBe("deny")
        expect(PermissionV2.evaluate("edit", "reports/topic/evidence.md", item.permissions).effect).toBe(
          name === "research" ? "allow" : "deny",
        )
        expect(PermissionV2.evaluate("task", "general", item.permissions).effect).toBe("deny")
        expect(PermissionV2.evaluate("task", "research-scout", item.permissions).effect).toBe(
          name === "research" ? "allow" : "deny",
        )
      }
      expect((yield* agent.resolve("compaction"))?.system).toContain(ResearchPrompt.compaction)
      for (const name of ["build", "plan"]) {
        const id = AgentV2.ID.make(name)
        expect((yield* agent.select(id)).info?.hidden).toBe(true)
        yield* agent.transform((draft) => draft.default(id))
        expect((yield* agent.default())?.id).toBe(AgentV2.ID.make("research"))
        yield* agent.transform((draft) =>
          draft.update(id, (item) => {
            item.hidden = false
          }),
        )
        expect((yield* agent.default())?.id).toBe(id)
        expect(
          (yield* agent.all()).filter((item) => item.mode !== "subagent" && !item.hidden).map((item) => item.id),
        ).toContain(id)
        yield* agent.transform((draft) =>
          draft.update(id, (item) => {
            item.hidden = true
          }),
        )
      }
      yield* agent.transform((draft) => draft.remove(AgentV2.defaultID))
      expect(yield* agent.default()).toBeUndefined()
    }),
  )
})
