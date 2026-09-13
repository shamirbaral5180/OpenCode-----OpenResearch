import { describe, expect } from "bun:test"
import { LayerNode } from "@openresearch-ai/core/effect/layer-node"
import { Effect, Fiber, Queue } from "effect"
import { ResearchPlanTool } from "../../src/tool/research-plan"
import { Question } from "../../src/question"
import { Session } from "@/session/session"
import { SessionID, MessageID } from "../../src/session/schema"
import { Agent } from "../../src/agent/agent"
import { Truncate } from "@/tool/truncate"
import { EventV2Bridge } from "../../src/event-v2-bridge"
import { Database } from "@openresearch-ai/core/database/database"
import { SessionProjector } from "@openresearch-ai/core/session/projector"
import { ResearchPlan } from "@openresearch-ai/core/research-plan"
import { testEffect } from "../lib/effect"

const it = testEffect(
  LayerNode.compile(
    LayerNode.group([
      Question.node,
      Session.node,
      SessionProjector.node,
      Database.node,
      EventV2Bridge.node,
      Truncate.node,
      Agent.node,
    ]),
  ),
)

const pending = Effect.fn("ResearchPlanToolTest.pending")(function* (question: Question.Interface) {
  const events = yield* EventV2Bridge.Service
  const asked = yield* Queue.unbounded<void>()
  const off = yield* events.listen((event) => {
    if (event.type === Question.Event.Asked.type) Queue.offerUnsafe(asked, undefined)
    return Effect.void
  })
  yield* Effect.addFinalizer(() => off)
  for (;;) {
    const item = (yield* question.list())[0]
    if (item) return item
    yield* Queue.take(asked).pipe(Effect.timeout("2 seconds"))
  }
})

const plan = {
  question: "How large is the market?",
  subquestions: [
    { question: "Top-down estimate", agents: ["research-scout"] },
    { question: "Bottom-up estimate", agents: ["research-scout"] },
    { question: "Challenge both", agents: ["research-redteam"] },
  ],
  estimated_cost_usd: 4.2,
}

describe("tool.research_plan", () => {
  it.instance("approval persists on the session and unblocks the plan", () =>
    Effect.gen(function* () {
      const sessions = yield* Session.Service
      const chat = yield* sessions.create({ title: "plan" })
      const ctx = {
        sessionID: chat.id,
        messageID: MessageID.ascending(),
        callID: "call-1",
        agent: "research",
        abort: AbortSignal.any([]),
        messages: [],
        metadata: () => Effect.void,
        ask: () => Effect.void,
      }
      const info = yield* ResearchPlanTool
      const tool = yield* info.init()
      const question = yield* Question.Service

      const fiber = yield* tool.execute(plan, ctx).pipe(Effect.forkScoped)
      const item = yield* pending(question)
      yield* question.reply({ requestID: item.id, answers: [["Approve and run"]] })
      const result = yield* Fiber.join(fiber)

      const metadata = result.metadata as { approved: boolean; workerCount: number }
      expect(metadata.approved).toBe(true)
      expect(metadata.workerCount).toBe(3)

      const stored = yield* sessions.get(chat.id)
      expect(ResearchPlan.isApproved(stored.metadata)).toBe(true)
      expect(ResearchPlan.reading(stored.metadata)?.estimatedCostUsd).toBe(4.2)
    }),
  )

  it.instance("declining the plan does not approve it", () =>
    Effect.gen(function* () {
      const sessions = yield* Session.Service
      const chat = yield* sessions.create({ title: "plan" })
      const ctx = {
        sessionID: chat.id,
        messageID: MessageID.ascending(),
        callID: "call-2",
        agent: "research",
        abort: AbortSignal.any([]),
        messages: [],
        metadata: () => Effect.void,
        ask: () => Effect.void,
      }
      const info = yield* ResearchPlanTool
      const tool = yield* info.init()
      const question = yield* Question.Service

      const fiber = yield* tool.execute(plan, ctx).pipe(Effect.forkScoped)
      const item = yield* pending(question)
      yield* question.reply({ requestID: item.id, answers: [["Don't run yet"]] })
      const result = yield* Fiber.join(fiber)

      const metadata = result.metadata as { approved: boolean }
      expect(metadata.approved).toBe(false)
      const stored = yield* sessions.get(chat.id)
      expect(ResearchPlan.isApproved(stored.metadata)).toBe(false)
    }),
  )
})
