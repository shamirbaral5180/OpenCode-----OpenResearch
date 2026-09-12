import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { InstanceState } from "@/effect/instance-state"
import { Knowledge } from "@openresearch-ai/core/knowledge/knowledge"
import { KnowledgeSchema } from "@openresearch-ai/core/knowledge/schema"

export const Parameters = Schema.Struct({
  action: Schema.Literals(["find_entity", "list_claims", "neighbors", "add_entity", "add_claim", "link"]).annotate({
    description:
      "Query or deliberately update the project knowledge base. Prefer automatic population from the evidence ledger; use writes here for entities/claims that are not tied to a ledger source.",
  }),
  query: Schema.optional(Schema.String).annotate({ description: "Name fragment for find_entity (case-insensitive)" }),
  kind: Schema.optional(KnowledgeSchema.EntityKind).annotate({
    description: "Entity kind, to narrow find_entity",
  }),
  name: Schema.optional(Schema.String).annotate({ description: "Entity name for add_entity" }),
  description: Schema.optional(Schema.String).annotate({ description: "Entity description for add_entity" }),
  aliases: Schema.optional(Schema.mutable(Schema.Array(Schema.String))).annotate({
    description: "Alternative names for add_entity",
  }),
  external_ids: Schema.optional(Schema.Record(Schema.String, Schema.String)).annotate({
    description: "External identifiers such as doi, orcid, wikidata for add_entity",
  }),
  statement: Schema.optional(Schema.String).annotate({ description: "Claim statement for add_claim" }),
  status: Schema.optional(KnowledgeSchema.ClaimStatus).annotate({
    description: "Claim verification status for add_claim (defaults to unverified)",
  }),
  confidence: Schema.optional(KnowledgeSchema.Confidence).annotate({
    description: "Claim confidence for add_claim",
  }),
  source_id: Schema.optional(Schema.String).annotate({
    description: "Evidence ledger source ID (S#) this claim came from, when applicable",
  }),
  topic: Schema.optional(Schema.String).annotate({ description: "Report topic the claim's source belongs to" }),
  entity_id: Schema.optional(Schema.String).annotate({
    description: "Entity ID for neighbors/claims-about or add_claim linking",
  }),
  node_id: Schema.optional(Schema.String).annotate({ description: "Node ID for neighbors" }),
  from_id: Schema.optional(Schema.String).annotate({ description: "Edge source ID for link" }),
  to_id: Schema.optional(Schema.String).annotate({ description: "Edge target ID for link" }),
  relation: Schema.optional(Schema.String).annotate({ description: 'Edge relation label for link, e.g. "worked-for"' }),
})

type Metadata = {
  action: string
  count: number
  error?: string
}

export const KnowledgeTool = Tool.define<typeof Parameters, Metadata, Knowledge.Service>(
  "knowledge",
  Effect.gen(function* () {
    const knowledge = yield* Knowledge.Service

    return {
      description:
        "Query or deliberately update the project's persistent knowledge base. Query actions: find_entity (search entities by name), list_claims (claims, optionally filtered), neighbors (connections of an entity/claim). Write actions: add_entity, add_claim, link. The graph is populated automatically from the evidence ledger, so use writes only for knowledge that is not tied to a ledger source. Knowledge is project-scoped and never shared across projects.",
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context<Metadata>) =>
        Effect.gen(function* () {
          const instance = yield* InstanceState.context
          const projectID = instance.project.id

          const fail = (error: string) =>
            Effect.gen(function* () {
              const metadata: Metadata = { action: params.action, count: 0, error }
              yield* ctx.metadata({ title: "knowledge error", metadata })
              return { title: "knowledge error", output: error, metadata }
            })

          const ok = (title: string, payload: unknown) =>
            Effect.gen(function* () {
              const metadata: Metadata = { action: params.action, count: 1 }
              yield* ctx.metadata({ title, metadata })
              return { title, output: JSON.stringify(payload, null, 2), metadata }
            })

          if (params.action === "find_entity") {
            const query = params.query ?? params.name
            if (!query) return yield* fail("query is required for find_entity")
            const entities = yield* knowledge.searchEntities({ projectID, query, kind: params.kind })
            const metadata: Metadata = { action: params.action, count: entities.length }
            yield* ctx.metadata({ title: `${entities.length} entit${entities.length === 1 ? "y" : "ies"}`, metadata })
            return { title: `${entities.length} entities`, output: JSON.stringify({ entities }, null, 2), metadata }
          }

          if (params.action === "list_claims") {
            const claims = params.entity_id
              ? yield* knowledge.claimsAbout({
                  projectID,
                  entityId: KnowledgeSchema.EntityID.make(params.entity_id),
                })
              : yield* knowledge.listClaims({ projectID, status: params.status, sourceId: params.source_id })
            const metadata: Metadata = { action: params.action, count: claims.length }
            yield* ctx.metadata({ title: `${claims.length} claim(s)`, metadata })
            return { title: `${claims.length} claims`, output: JSON.stringify({ claims }, null, 2), metadata }
          }

          if (params.action === "neighbors") {
            const nodeId = params.node_id ?? params.entity_id
            if (!nodeId) return yield* fail("node_id is required for neighbors")
            const neighbors = yield* knowledge.neighbors({ projectID, nodeId })
            const metadata: Metadata = { action: params.action, count: neighbors.length }
            yield* ctx.metadata({ title: `${neighbors.length} connection(s)`, metadata })
            return { title: `${neighbors.length} neighbors`, output: JSON.stringify({ neighbors }, null, 2), metadata }
          }

          if (params.action === "add_entity") {
            if (!params.name) return yield* fail("name is required for add_entity")
            const entity = yield* knowledge.upsertEntity({
              projectID,
              kind: params.kind ?? "other",
              name: params.name,
              description: params.description,
              aliases: params.aliases,
              externalIds: params.external_ids,
            })
            return yield* ok(`entity ${entity.name}`, { entity })
          }

          if (params.action === "add_claim") {
            if (!params.statement) return yield* fail("statement is required for add_claim")
            const entityIds = params.entity_id
              ? [KnowledgeSchema.EntityID.make(params.entity_id)]
              : undefined
            const claim = yield* knowledge.addClaim({
              projectID,
              statement: params.statement,
              status: params.status,
              confidence: params.confidence,
              sourceId: params.source_id,
              sourceTopic: params.topic,
              entityIds,
            })
            return yield* ok(`claim ${claim.id}`, { claim })
          }

          if (params.from_id && params.to_id && params.relation) {
            const edge = yield* knowledge.link({
              projectID,
              fromId: params.from_id,
              fromKind: params.from_id.startsWith("knc_") ? "claim" : "entity",
              toId: params.to_id,
              toKind: params.to_id.startsWith("knc_") ? "claim" : "entity",
              relation: params.relation,
            })
            return yield* ok(`linked ${params.relation}`, { edge })
          }

          return yield* fail("from_id, to_id, and relation are required for link")
        }).pipe(Effect.orDie),
    }
  }),
)
