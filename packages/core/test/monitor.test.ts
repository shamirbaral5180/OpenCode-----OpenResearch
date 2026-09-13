import { describe, expect } from "bun:test"
import { Effect } from "effect"
import { Database } from "@openresearch-ai/core/database/database"
import { LayerNode } from "@openresearch-ai/core/effect/layer-node"
import { AppNodeBuilder } from "@openresearch-ai/core/effect/app-node-builder"
import { Monitor } from "@openresearch-ai/core/monitor/monitor"
import { MonitorSchema } from "@openresearch-ai/core/monitor/schema"
import { Project } from "@openresearch-ai/core/project"
import { ProjectTable } from "@openresearch-ai/core/project/sql"
import { AbsolutePath } from "@openresearch-ai/core/schema"
import { testEffect } from "./lib/effect"

const it = testEffect(AppNodeBuilder.build(LayerNode.group([Database.node, Monitor.node])))

const projectA = Project.ID.make("monitor-project-a")
const projectB = Project.ID.make("monitor-project-b")

function setup() {
  return Database.Service.use(({ db }) =>
    db
      .insert(ProjectTable)
      .values([
        { id: projectA, worktree: AbsolutePath.make("/tmp/mon-a"), sandboxes: [], time_created: 1, time_updated: 1 },
        { id: projectB, worktree: AbsolutePath.make("/tmp/mon-b"), sandboxes: [], time_created: 1, time_updated: 1 },
      ])
      .onConflictDoNothing()
      .run()
      .pipe(Effect.orDie),
  )
}

describe("Monitor", () => {
  it.effect("creates watches scoped per project with a computed next run", () =>
    Effect.gen(function* () {
      yield* setup()
      const monitor = yield* Monitor.Service

      const watch = yield* monitor.create({
        projectID: projectA,
        topic: "troy",
        question: "Any new scholarships?",
        cadence: "daily",
      })
      expect(watch.status).toBe("active")
      expect(watch.run_count).toBe(0)
      expect(watch.next_run_at).toBeGreaterThan(watch.created_at)
      expect(yield* monitor.list(projectA)).toHaveLength(1)
      expect(yield* monitor.list(projectB)).toHaveLength(0)
    }),
  )

  it.effect("due returns only active watches past their next run time", () =>
    Effect.gen(function* () {
      yield* setup()
      const monitor = yield* Monitor.Service
      const past = Date.now() - 1000
      const future = Date.now() + 100_000

      yield* monitor.create({
        projectID: projectA,
        topic: "due",
        question: "q",
        cadence: "hourly",
        nextRunAt: past,
      })
      yield* monitor.create({
        projectID: projectA,
        topic: "later",
        question: "q",
        cadence: "hourly",
        nextRunAt: future,
      })
      const paused = yield* monitor.create({
        projectID: projectA,
        topic: "paused",
        question: "q",
        cadence: "hourly",
        nextRunAt: past,
      })
      yield* monitor.setStatus({ projectID: projectA, id: paused.id, status: "paused" })

      const due = yield* monitor.due(Date.now())
      expect(due.map((item) => item.topic)).toEqual(["due"])
    }),
  )

  it.effect("recordRun advances the schedule and stores the outcome", () =>
    Effect.gen(function* () {
      yield* setup()
      const monitor = yield* Monitor.Service
      const watch = yield* monitor.create({ projectID: projectA, topic: "t", question: "q", cadence: "weekly" })
      const at = watch.created_at + 1000

      const updated = (yield* monitor.recordRun({
        projectID: projectA,
        id: watch.id,
        at,
        sessionId: "ses_x",
        summary: "nothing new",
      }))!
      expect(updated.run_count).toBe(1)
      expect(updated.last_run_at).toBe(at)
      expect(updated.next_run_at).toBe(at + MonitorSchema.cadenceMs.weekly)
      expect(updated.last_session_id).toBe("ses_x")
      expect(updated.last_summary).toBe("nothing new")
    }),
  )

  it.effect("pause, resume, and remove are project-scoped", () =>
    Effect.gen(function* () {
      yield* setup()
      const monitor = yield* Monitor.Service
      const watch = yield* monitor.create({ projectID: projectA, topic: "t", question: "q", cadence: "daily" })

      expect(yield* monitor.setStatus({ projectID: projectB, id: watch.id, status: "paused" })).toBeUndefined()
      const paused = (yield* monitor.setStatus({ projectID: projectA, id: watch.id, status: "paused" }))!
      expect(paused.status).toBe("paused")
      expect(yield* monitor.remove(projectB, watch.id)).toBe(false)
      expect(yield* monitor.remove(projectA, watch.id)).toBe(true)
      expect(yield* monitor.get(projectA, watch.id)).toBeUndefined()
    }),
  )
})
