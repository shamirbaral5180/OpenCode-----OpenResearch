import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { InstanceState } from "@/effect/instance-state"
import { Monitor } from "@openresearch-ai/core/monitor/monitor"
import { MonitorSchema } from "@openresearch-ai/core/monitor/schema"

export const Parameters = Schema.Struct({
  action: Schema.Literals(["list", "create", "pause", "resume", "remove"]).annotate({
    description: "Manage continuous research monitors (local watches that re-run a research question on a cadence)",
  }),
  topic: Schema.optional(Schema.String).annotate({
    description: "Short topic label for create; also the report topic used for the run",
  }),
  question: Schema.optional(Schema.String).annotate({
    description: "The recurring research question for create",
  }),
  cadence: Schema.optional(MonitorSchema.Cadence).annotate({
    description: "How often to re-run: hourly, daily, or weekly (default daily)",
  }),
  watch_id: Schema.optional(Schema.String).annotate({
    description: "Watch ID for pause, resume, or remove",
  }),
})

type Metadata = {
  action: string
  count: number
  error?: string
}

export const MonitorTool = Tool.define<typeof Parameters, Metadata, Monitor.Service>(
  "monitor",
  Effect.gen(function* () {
    const monitor = yield* Monitor.Service

    return {
      description:
        "Manage continuous research monitoring. A watch re-runs a research question on a cadence, compares new sources against prior knowledge, and records updates. Monitoring is local-first: watches run only in this device's database and are never sent to a server unless the user opts in. Use create to start watching a topic; list to see active watches; pause, resume, or remove by watch_id.",
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context<Metadata>) =>
        Effect.gen(function* () {
          const instance = yield* InstanceState.context
          const projectID = instance.project.id

          const fail = (error: string) =>
            Effect.gen(function* () {
              const metadata: Metadata = { action: params.action, count: 0, error }
              yield* ctx.metadata({ title: "monitor error", metadata })
              return { title: "monitor error", output: error, metadata }
            })

          if (params.action === "list") {
            const watches = yield* monitor.list(projectID)
            const metadata: Metadata = { action: params.action, count: watches.length }
            yield* ctx.metadata({ title: `${watches.length} watch(es)`, metadata })
            return { title: `${watches.length} monitors`, output: JSON.stringify({ watches }, null, 2), metadata }
          }

          if (params.action === "create") {
            if (!params.topic || !params.question) return yield* fail("topic and question are required for create")
            const watch = yield* monitor.create({
              projectID,
              topic: params.topic,
              question: params.question,
              cadence: params.cadence ?? "daily",
            })
            const metadata: Metadata = { action: params.action, count: 1 }
            yield* ctx.metadata({ title: `watching ${watch.topic}`, metadata })
            return {
              title: `monitor created: ${watch.topic}`,
              output: JSON.stringify(
                {
                  watch,
                  note: "Watches run locally while the app is open. They never leave this device unless server-side monitoring is explicitly enabled.",
                },
                null,
                2,
              ),
              metadata,
            }
          }

          if (!params.watch_id) return yield* fail("watch_id is required")
          const id = MonitorSchema.WatchID.make(params.watch_id)
          if (params.action === "remove") {
            const removed = yield* monitor.remove(projectID, id)
            const metadata: Metadata = { action: params.action, count: removed ? 1 : 0 }
            yield* ctx.metadata({ title: removed ? "watch removed" : "watch not found", metadata })
            return { title: removed ? "removed" : "not found", output: JSON.stringify({ removed }), metadata }
          }

          const watch = yield* monitor.setStatus({
            projectID,
            id,
            status: params.action === "pause" ? "paused" : "active",
          })
          if (!watch) return yield* fail(`watch ${params.watch_id} not found`)
          const metadata: Metadata = { action: params.action, count: 1 }
          yield* ctx.metadata({ title: `watch ${watch.status}`, metadata })
          return { title: `${params.action}d ${watch.topic}`, output: JSON.stringify({ watch }, null, 2), metadata }
        }).pipe(Effect.orDie),
    }
  }),
)
