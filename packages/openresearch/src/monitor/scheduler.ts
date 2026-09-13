export * as MonitorScheduler from "./scheduler"

import { LayerNode } from "@openresearch-ai/core/effect/layer-node"
import { Monitor } from "@openresearch-ai/core/monitor/monitor"
import { MonitorSchema } from "@openresearch-ai/core/monitor/schema"
import { InstanceState } from "@/effect/instance-state"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Session } from "@/session/session"
import { SessionPrompt } from "@/session/prompt"
import { MessageID } from "@/session/schema"
import { Effect, Layer, Duration, Schedule, Context } from "effect"

// Poll interval for due watches. Short enough to feel responsive for an
// app-open monitor, long enough to avoid churn.
const POLL = Duration.seconds(60)

export interface Interface {
  readonly init: () => Effect.Effect<void>
  // Run any due watches now (used by tests and manual triggering).
  readonly tick: () => Effect.Effect<void>
  readonly runWatch: (watch: MonitorSchema.Watch) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@openresearch/MonitorScheduler") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const monitor = yield* Monitor.Service
    const sessions = yield* Session.Service
    const prompt = yield* SessionPrompt.Service
    const flags = yield* RuntimeFlags.Service

    const runWatch = Effect.fn("MonitorScheduler.runWatch")(function* (watch: MonitorSchema.Watch) {
      const instance = yield* InstanceState.context
      const instruction = [
        `Scheduled monitoring run for topic "${watch.topic}".`,
        ``,
        `Original watch question: ${watch.question}`,
        ``,
        `Investigate what is new since the last run: search for recent primary sources, official announcements, publications, and contrary evidence. Compare against prior findings in the knowledge base for this topic and surface anything that changes, confirms, or contradicts them. Record sources in the evidence ledger and update the project knowledge base. Keep the update concise and cite sources; if nothing material is new, say so explicitly instead of inventing findings.`,
      ].join("\n")

      const session = yield* sessions.create({
        title: `Monitor: ${watch.topic}`,
        agent: "research",
        metadata: { monitor: { watchId: watch.id, topic: watch.topic } },
      })
      const result = yield* prompt
        .prompt({
          sessionID: session.id,
          messageID: MessageID.ascending(),
          agent: "research",
          parts: [{ type: "text", text: instruction }],
        })
        .pipe(
          Effect.catchCause(() =>
            Effect.gen(function* () {
              yield* Effect.logWarning("monitor run failed", { watchId: watch.id })
              return undefined
            }),
          ),
        )

      const summary =
        result && result.info.role === "assistant" && !result.info.error
          ? result.parts.findLast((part) => part.type === "text")?.text?.slice(0, 500)
          : undefined
      yield* monitor.recordRun({
        projectID: instance.project.id,
        id: watch.id,
        at: Date.now(),
        sessionId: session.id,
        summary,
      })
    })

    const tick = Effect.fn("MonitorScheduler.tick")(function* () {
      if (flags.monitoring === "off") return
      const instance = yield* InstanceState.context
      const due = yield* monitor.due(Date.now())
      for (const watch of due) {
        if (watch.project_id !== instance.project.id) continue
        yield* runWatch(watch).pipe(Effect.catchCause(() => Effect.void))
      }
    })

    const state = yield* InstanceState.make<void>(
      Effect.fn("MonitorScheduler.state")(function* () {
        yield* Effect.repeat(
          tick().pipe(Effect.catchCause(() => Effect.void)),
          { schedule: Schedule.fixed(POLL) },
        ).pipe(Effect.forkScoped)
      }),
    )

    return Service.of({
      init: Effect.fn("MonitorScheduler.init")(function* () {
        yield* InstanceState.get(state)
      }),
      tick: Effect.fn("MonitorScheduler.tick")(function* () {
        yield* tick()
      }),
      runWatch,
    })
  }),
)

export const node = LayerNode.make({
  service: Service,
  layer,
  deps: [Monitor.node, Session.node, SessionPrompt.node, RuntimeFlags.node],
})
