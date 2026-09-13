import { afterEach, describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { LayerNode } from "@openresearch-ai/core/effect/layer-node"
import { Monitor } from "@openresearch-ai/core/monitor/monitor"
import { Database } from "@openresearch-ai/core/database/database"
import { MonitorScheduler } from "../../src/monitor/scheduler"
import { Session } from "@/session/session"
import { SessionPrompt } from "@/session/prompt"
import { SessionProjector } from "@openresearch-ai/core/session/projector"
import { InstanceState } from "../../src/effect/instance-state"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { MessageID, PartID } from "../../src/session/schema"
import { disposeAllInstances } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

afterEach(async () => {
  await disposeAllInstances()
})

// Stub the research turn so a tick records a run without a provider. The
// scheduler must still create the child session and advance the watch.
const promptStub = Layer.mock(SessionPrompt.Service, {
  prompt: (input) =>
    Effect.sync(() => {
      const messageID = input.messageID ?? MessageID.ascending()
      const message = {
        id: messageID,
        role: "assistant" as const,
        parentID: MessageID.ascending(),
        sessionID: input.sessionID,
        mode: "research",
        agent: "research",
        cost: 0,
        path: { cwd: "/tmp", root: "/tmp" },
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        modelID: input.model?.modelID ?? ("test-model" as never),
        providerID: input.model?.providerID ?? ("test" as never),
        time: { created: Date.now() },
        finish: "stop" as const,
      }
      return {
        info: message,
        parts: [
          { id: PartID.ascending(), messageID, sessionID: input.sessionID, type: "text" as const, text: "monitored" },
        ],
      }
    }),
})

const layer = LayerNode.compile(
  LayerNode.group([
    MonitorScheduler.node,
    Monitor.node,
    Session.node,
    SessionProjector.node,
    Database.node,
    RuntimeFlags.node,
  ]),
  [[SessionPrompt.node, promptStub]],
)

const it = testEffect(layer)

describe("MonitorScheduler", () => {
  it.instance("tick runs due watches and records the outcome", () =>
    Effect.gen(function* () {
      const monitor = yield* Monitor.Service
      const sessions = yield* Session.Service
      const instance = yield* InstanceState.context
      const scheduler = yield* MonitorScheduler.Service

      const watch = yield* monitor.create({
        projectID: instance.project.id,
        topic: "troy",
        question: "what changed?",
        cadence: "daily",
        nextRunAt: Date.now() - 1000,
      })

      yield* scheduler.tick()

      const updated = (yield* monitor.get(instance.project.id, watch.id))!
      expect(updated.run_count).toBe(1)
      expect(updated.last_run_at).toBeDefined()
      expect(updated.next_run_at).toBeGreaterThan(updated.last_run_at!)
      expect(updated.last_session_id).toBeDefined()
      expect(updated.last_summary).toBe("monitored")

      const session = yield* sessions.get(updated.last_session_id as never)
      expect(session.agent).toBe("research")
      expect(session.title).toContain("Monitor:")

      // A second tick with nothing due does not re-run.
      yield* scheduler.tick()
      expect((yield* monitor.get(instance.project.id, watch.id))!.run_count).toBe(1)
    }),
  )
})
