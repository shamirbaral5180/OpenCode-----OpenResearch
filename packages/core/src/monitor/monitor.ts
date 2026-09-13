export * as Monitor from "./monitor"

import { and, asc, eq, lte } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"
import { Database } from "../database/database"
import { makeGlobalNode } from "../effect/app-node"
import { ProjectSchema } from "../project/schema"
import { MonitorSchema } from "./schema"
import { MonitorWatchTable } from "./sql"

type WatchRow = typeof MonitorWatchTable.$inferSelect

function toWatch(row: WatchRow): MonitorSchema.Watch {
  return {
    id: row.id,
    project_id: row.project_id,
    topic: row.topic,
    question: row.question,
    cadence: row.cadence,
    status: row.status,
    created_at: row.created_at,
    last_run_at: row.last_run_at ?? undefined,
    next_run_at: row.next_run_at,
    run_count: row.run_count,
    last_session_id: row.last_session_id ?? undefined,
    last_summary: row.last_summary ?? undefined,
  }
}

export interface Interface {
  readonly create: (input: MonitorSchema.CreateInput) => Effect.Effect<MonitorSchema.Watch>
  readonly list: (projectID: ProjectSchema.ID) => Effect.Effect<ReadonlyArray<MonitorSchema.Watch>>
  readonly get: (projectID: ProjectSchema.ID, id: MonitorSchema.WatchID) => Effect.Effect<MonitorSchema.Watch | undefined>
  readonly due: (now: number) => Effect.Effect<ReadonlyArray<MonitorSchema.Watch>>
  readonly setStatus: (input: {
    projectID: ProjectSchema.ID
    id: MonitorSchema.WatchID
    status: MonitorSchema.WatchStatus
  }) => Effect.Effect<MonitorSchema.Watch | undefined>
  readonly remove: (projectID: ProjectSchema.ID, id: MonitorSchema.WatchID) => Effect.Effect<boolean>
  // Record the outcome of a run and schedule the next one.
  readonly recordRun: (input: {
    projectID: ProjectSchema.ID
    id: MonitorSchema.WatchID
    at: number
    sessionId?: string
    summary?: string
  }) => Effect.Effect<MonitorSchema.Watch | undefined>
}

export class Service extends Context.Service<Service, Interface>()("@openresearch/Monitor") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const db = (yield* Database.Service).db

    const get = Effect.fn("Monitor.get")(function* (projectID: ProjectSchema.ID, id: MonitorSchema.WatchID) {
      const row = yield* db
        .select()
        .from(MonitorWatchTable)
        .where(and(eq(MonitorWatchTable.project_id, projectID), eq(MonitorWatchTable.id, id)))
        .get()
        .pipe(Effect.orDie)
      return row ? toWatch(row) : undefined
    })

    const create = Effect.fn("Monitor.create")(function* (input: MonitorSchema.CreateInput) {
      const now = Date.now()
      const id = MonitorSchema.WatchID.create()
      const next_run_at = input.nextRunAt ?? now + MonitorSchema.cadenceMs[input.cadence]
      yield* db
        .insert(MonitorWatchTable)
        .values({
          id,
          project_id: input.projectID,
          topic: input.topic,
          question: input.question,
          cadence: input.cadence,
          status: "active",
          created_at: now,
          next_run_at,
          run_count: 0,
        })
        .run()
        .pipe(Effect.orDie)
      return (yield* get(input.projectID, id))!
    })

    const list = Effect.fn("Monitor.list")(function* (projectID: ProjectSchema.ID) {
      const rows = yield* db
        .select()
        .from(MonitorWatchTable)
        .where(eq(MonitorWatchTable.project_id, projectID))
        .orderBy(asc(MonitorWatchTable.next_run_at))
        .all()
        .pipe(Effect.orDie)
      return rows.map(toWatch)
    })

    const due = Effect.fn("Monitor.due")(function* (now: number) {
      const rows = yield* db
        .select()
        .from(MonitorWatchTable)
        .where(and(eq(MonitorWatchTable.status, "active"), lte(MonitorWatchTable.next_run_at, now)))
        .orderBy(asc(MonitorWatchTable.next_run_at))
        .all()
        .pipe(Effect.orDie)
      return rows.map(toWatch)
    })

    const setStatus = Effect.fn("Monitor.setStatus")(function* (input: {
      projectID: ProjectSchema.ID
      id: MonitorSchema.WatchID
      status: MonitorSchema.WatchStatus
    }) {
      yield* db
        .update(MonitorWatchTable)
        .set({ status: input.status })
        .where(and(eq(MonitorWatchTable.project_id, input.projectID), eq(MonitorWatchTable.id, input.id)))
        .run()
        .pipe(Effect.orDie)
      return yield* get(input.projectID, input.id)
    })

    const remove = Effect.fn("Monitor.remove")(function* (projectID: ProjectSchema.ID, id: MonitorSchema.WatchID) {
      const removed = yield* db
        .delete(MonitorWatchTable)
        .where(and(eq(MonitorWatchTable.project_id, projectID), eq(MonitorWatchTable.id, id)))
        .returning({ id: MonitorWatchTable.id })
        .get()
        .pipe(Effect.orDie)
      return removed !== undefined
    })

    const recordRun = Effect.fn("Monitor.recordRun")(function* (input: {
      projectID: ProjectSchema.ID
      id: MonitorSchema.WatchID
      at: number
      sessionId?: string
      summary?: string
    }) {
      const current = yield* get(input.projectID, input.id)
      if (!current) return undefined
      yield* db
        .update(MonitorWatchTable)
        .set({
          last_run_at: input.at,
          next_run_at: input.at + MonitorSchema.cadenceMs[current.cadence],
          run_count: current.run_count + 1,
          last_session_id: input.sessionId ?? current.last_session_id ?? null,
          last_summary: input.summary ?? current.last_summary ?? null,
        })
        .where(and(eq(MonitorWatchTable.project_id, input.projectID), eq(MonitorWatchTable.id, input.id)))
        .run()
        .pipe(Effect.orDie)
      return yield* get(input.projectID, input.id)
    })

    return Service.of({ create, list, get, due, setStatus, remove, recordRun })
  }),
)

export const node = makeGlobalNode({ service: Service, layer: layer, deps: [Database.node] })
