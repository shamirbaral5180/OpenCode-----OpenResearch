export * as MonitorSchema from "./schema"

import { Schema } from "effect"
import { ascending } from "@openresearch-ai/schema/identifier"
import { statics } from "@openresearch-ai/schema/schema"
import { ProjectSchema } from "../project/schema"

export const WatchID = Schema.String.check(Schema.isStartsWith("knw_")).pipe(
  Schema.brand("Monitor.WatchID"),
  statics((schema) => ({ create: () => schema.make("knw_" + ascending()) })),
)
export type WatchID = typeof WatchID.Type

export const WatchStatus = Schema.Literals(["active", "paused"])
export type WatchStatus = typeof WatchStatus.Type

export const Cadence = Schema.Literals(["hourly", "daily", "weekly"])
export type Cadence = typeof Cadence.Type

export const cadenceMs: Record<Cadence, number> = {
  hourly: 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
}

export const Watch = Schema.Struct({
  id: WatchID,
  project_id: ProjectSchema.ID,
  topic: Schema.String,
  question: Schema.String,
  cadence: Cadence,
  status: WatchStatus,
  created_at: Schema.Number,
  last_run_at: Schema.optional(Schema.Number),
  next_run_at: Schema.Number,
  run_count: Schema.Number,
  last_session_id: Schema.optional(Schema.String),
  last_summary: Schema.optional(Schema.String),
})
export interface Watch extends Schema.Schema.Type<typeof Watch> {}

export const CreateInput = Schema.Struct({
  projectID: ProjectSchema.ID,
  topic: Schema.String,
  question: Schema.String,
  cadence: Cadence,
  // Optional first-run delay; defaults to one full cadence from now.
  nextRunAt: Schema.optional(Schema.Number),
})
export type CreateInput = typeof CreateInput.Type
