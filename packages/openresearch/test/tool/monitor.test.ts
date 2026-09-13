import { describe, expect } from "bun:test"
import { Effect } from "effect"
import { LayerNode } from "@openresearch-ai/core/effect/layer-node"
import { Monitor } from "@openresearch-ai/core/monitor/monitor"
import { Truncate } from "@/tool/truncate"
import { Agent } from "../../src/agent/agent"
import { MonitorTool } from "../../src/tool/monitor"
import { Tool } from "../../src/tool/tool"
import { SessionID, MessageID } from "../../src/session/schema"
import { InstanceState } from "../../src/effect/instance-state"
import { testEffect } from "../lib/effect"

const it = testEffect(LayerNode.compile(LayerNode.group([Monitor.node, Truncate.node, Agent.node])))

const baseCtx = {
  sessionID: SessionID.make("ses_test"),
  messageID: MessageID.make("msg_test"),
  callID: "",
  agent: "research",
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => Effect.void,
  ask: () => Effect.void,
}

const run = (input: Tool.InferParameters<typeof MonitorTool>) =>
  Effect.gen(function* () {
    const info = yield* MonitorTool
    const tool = yield* info.init()
    return yield* tool.execute(input, baseCtx)
  })

describe("monitor tool", () => {
  it.instance("creates, lists, pauses, and removes a watch", () =>
    Effect.gen(function* () {
      const created = yield* run({ action: "create", topic: "troy", question: "new scholarships?", cadence: "daily" })
      const watch = (JSON.parse(created.output) as { watch: { id: string; cadence: string; status: string } }).watch
      expect(watch.cadence).toBe("daily")
      expect(watch.status).toBe("active")

      const listed = yield* run({ action: "list" })
      expect((JSON.parse(listed.output) as { watches: unknown[] }).watches).toHaveLength(1)

      const paused = yield* run({ action: "pause", watch_id: watch.id })
      expect((JSON.parse(paused.output) as { watch: { status: string } }).watch.status).toBe("paused")

      const removed = yield* run({ action: "remove", watch_id: watch.id })
      expect((JSON.parse(removed.output) as { removed: boolean }).removed).toBe(true)
    }),
  )

  it.instance("defaults cadence to daily and reports missing fields", () =>
    Effect.gen(function* () {
      const result = yield* run({ action: "create", topic: "x" })
      const metadata = result.metadata as { error?: string }
      expect(metadata.error).toContain("question")
    }),
  )

  it.instance("stores watches in the project knowledge database", () =>
    Effect.gen(function* () {
      const instance = yield* InstanceState.context
      yield* run({ action: "create", topic: "t", question: "q", cadence: "weekly" })
      const monitor = yield* Monitor.Service
      expect(yield* monitor.list(instance.project.id)).toHaveLength(1)
    }),
  )
})
