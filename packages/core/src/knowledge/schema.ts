export * as KnowledgeSchema from "./schema"

import { Schema } from "effect"
import { ascending } from "@openresearch-ai/schema/identifier"
import { statics } from "@openresearch-ai/schema/schema"
import { ProjectSchema } from "../project/schema"

const id = (prefix: string, brand: string) =>
  Schema.String.check(Schema.isStartsWith(prefix)).pipe(
    Schema.brand(brand),
    statics((schema) => ({ create: () => schema.make(prefix + "_" + ascending()) })),
  )

export const EntityID = id("kne_", "Knowledge.EntityID")
export type EntityID = typeof EntityID.Type

export const ClaimID = id("knc_", "Knowledge.ClaimID")
export type ClaimID = typeof ClaimID.Type

export const EdgeID = id("knr_", "Knowledge.EdgeID")
export type EdgeID = typeof EdgeID.Type

export const EntityKind = Schema.Literals([
  "person",
  "organization",
  "publication",
  "concept",
  "dataset",
  "event",
  "place",
  "other",
])
export type EntityKind = typeof EntityKind.Type

export const ClaimStatus = Schema.Literals(["unverified", "verified", "partial", "contradicted"])
export type ClaimStatus = typeof ClaimStatus.Type

export const Confidence = Schema.Literals(["low", "medium", "high"])
export type Confidence = typeof Confidence.Type

export const NodeKind = Schema.Literals(["entity", "claim"])
export type NodeKind = typeof NodeKind.Type

// Collapse case and whitespace so "(Example Corp)" and "example   corp" dedupe.
export function normalizeName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ")
}

export const Entity = Schema.Struct({
  id: EntityID,
  project_id: ProjectSchema.ID,
  kind: EntityKind,
  name: Schema.String,
  normalized_name: Schema.String,
  description: Schema.optional(Schema.String),
  aliases: Schema.Array(Schema.String),
  external_ids: Schema.Record(Schema.String, Schema.String),
  time_created: Schema.Number,
  time_updated: Schema.Number,
})
export interface Entity extends Schema.Schema.Type<typeof Entity> {}

export const Claim = Schema.Struct({
  id: ClaimID,
  project_id: ProjectSchema.ID,
  statement: Schema.String,
  status: ClaimStatus,
  confidence: Schema.optional(Confidence),
  as_of: Schema.optional(Schema.Number),
  source_id: Schema.optional(Schema.String),
  source_topic: Schema.optional(Schema.String),
  session_id: Schema.optional(Schema.String),
  // Stable identity of the source ledger record this claim came from, so
  // re-populating the same ledger updates instead of duplicating.
  origin_key: Schema.optional(Schema.String),
  time_created: Schema.Number,
  time_updated: Schema.Number,
})
export interface Claim extends Schema.Schema.Type<typeof Claim> {}

export const Edge = Schema.Struct({
  id: EdgeID,
  project_id: ProjectSchema.ID,
  from_id: Schema.String,
  from_kind: NodeKind,
  to_id: Schema.String,
  to_kind: NodeKind,
  relation: Schema.String,
  time_created: Schema.Number,
  time_updated: Schema.Number,
})
export interface Edge extends Schema.Schema.Type<typeof Edge> {}

export const EntityInput = Schema.Struct({
  projectID: ProjectSchema.ID,
  kind: EntityKind,
  name: Schema.String,
  description: Schema.optional(Schema.String),
  aliases: Schema.optional(Schema.Array(Schema.String)),
  externalIds: Schema.optional(Schema.Record(Schema.String, Schema.String)),
})
export type EntityInput = typeof EntityInput.Type

export const ClaimInput = Schema.Struct({
  projectID: ProjectSchema.ID,
  statement: Schema.String,
  status: Schema.optional(ClaimStatus),
  confidence: Schema.optional(Confidence),
  asOf: Schema.optional(Schema.Number),
  sourceId: Schema.optional(Schema.String),
  sourceTopic: Schema.optional(Schema.String),
  sessionId: Schema.optional(Schema.String),
  entityIds: Schema.optional(Schema.Array(EntityID)),
  originKey: Schema.optional(Schema.String),
})
export type ClaimInput = typeof ClaimInput.Type

export const EdgeInput = Schema.Struct({
  projectID: ProjectSchema.ID,
  fromId: Schema.String,
  fromKind: NodeKind,
  toId: Schema.String,
  toKind: NodeKind,
  relation: Schema.String,
})
export type EdgeInput = typeof EdgeInput.Type
