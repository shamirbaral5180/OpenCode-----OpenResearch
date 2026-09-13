export * as Knowledge from "./knowledge"

import { and, eq, inArray, like, or } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"
import { Database } from "../database/database"
import { makeGlobalNode } from "../effect/app-node"
import { ProjectSchema } from "../project/schema"
import { KnowledgeSchema } from "./schema"
import { KnowledgeRelevance } from "./relevance"
import { KnowledgeClaimTable, KnowledgeEdgeTable, KnowledgeEntityTable } from "./sql"

type EntityRow = typeof KnowledgeEntityTable.$inferSelect
type ClaimRow = typeof KnowledgeClaimTable.$inferSelect
type EdgeRow = typeof KnowledgeEdgeTable.$inferSelect

function toEntity(row: EntityRow): KnowledgeSchema.Entity {
  return {
    id: row.id,
    project_id: row.project_id,
    kind: row.kind,
    name: row.name,
    normalized_name: row.normalized_name,
    description: row.description ?? undefined,
    aliases: row.aliases ?? [],
    external_ids: row.external_ids ?? {},
    time_created: row.time_created,
    time_updated: row.time_updated,
  }
}

function toClaim(row: ClaimRow): KnowledgeSchema.Claim {
  return {
    id: row.id,
    project_id: row.project_id,
    statement: row.statement,
    status: row.status,
    confidence: row.confidence ?? undefined,
    as_of: row.as_of ?? undefined,
    source_id: row.source_id ?? undefined,
    source_topic: row.source_topic ?? undefined,
    session_id: row.session_id ?? undefined,
    origin_key: row.origin_key ?? undefined,
    time_created: row.time_created,
    time_updated: row.time_updated,
  }
}

function toEdge(row: EdgeRow): KnowledgeSchema.Edge {
  return {
    id: row.id,
    project_id: row.project_id,
    from_id: row.from_id,
    from_kind: row.from_kind,
    to_id: row.to_id,
    to_kind: row.to_kind,
    relation: row.relation,
    time_created: row.time_created,
    time_updated: row.time_updated,
  }
}

export interface Neighbor {
  readonly edge: KnowledgeSchema.Edge
  readonly node: { readonly id: string; readonly kind: KnowledgeSchema.NodeKind }
}

export interface ContextClaim {
  readonly id: KnowledgeSchema.ClaimID
  readonly statement: string
  readonly status: KnowledgeSchema.ClaimStatus
  readonly confidence?: KnowledgeSchema.Confidence
  readonly source_id?: string
  readonly source_topic?: string
}

export interface ContextEntity {
  readonly id: KnowledgeSchema.EntityID
  readonly kind: KnowledgeSchema.EntityKind
  readonly name: string
}

// Prior knowledge for prompt injection, ordered most-relevant-first.
export interface Context {
  readonly counts: { readonly entities: number; readonly claims: number; readonly edges: number }
  readonly contradictions: ReadonlyArray<ContextClaim>
  readonly claims: ReadonlyArray<ContextClaim>
  readonly entities: ReadonlyArray<ContextEntity>
}

export interface Interface {
  readonly upsertEntity: (input: KnowledgeSchema.EntityInput) => Effect.Effect<KnowledgeSchema.Entity>
  readonly getEntity: (projectID: ProjectSchema.ID, id: KnowledgeSchema.EntityID) => Effect.Effect<KnowledgeSchema.Entity | undefined>
  readonly findEntity: (input: {
    projectID: ProjectSchema.ID
    name: string
    kind?: KnowledgeSchema.EntityKind
  }) => Effect.Effect<KnowledgeSchema.Entity | undefined>
  readonly listEntities: (projectID: ProjectSchema.ID) => Effect.Effect<ReadonlyArray<KnowledgeSchema.Entity>>
  readonly searchEntities: (input: {
    projectID: ProjectSchema.ID
    query: string
    kind?: KnowledgeSchema.EntityKind
    limit?: number
  }) => Effect.Effect<ReadonlyArray<KnowledgeSchema.Entity>>
  readonly removeEntity: (projectID: ProjectSchema.ID, id: KnowledgeSchema.EntityID) => Effect.Effect<boolean>

  readonly addClaim: (input: KnowledgeSchema.ClaimInput) => Effect.Effect<KnowledgeSchema.Claim>
  readonly populateFromEvidence: (input: {
    projectID: ProjectSchema.ID
    topic: string
    records: ReadonlyArray<{
      source_id: string
      claim_id: string
      claim: string
      verdict: KnowledgeSchema.ClaimStatus
      confidence?: KnowledgeSchema.Confidence
      source?: { title?: string; doi?: string; url?: string }
    }>
  }) => Effect.Effect<{ entities: number; claims: number }>
  readonly getClaim: (projectID: ProjectSchema.ID, id: KnowledgeSchema.ClaimID) => Effect.Effect<KnowledgeSchema.Claim | undefined>
  readonly listClaims: (input?: {
    projectID: ProjectSchema.ID
    status?: KnowledgeSchema.ClaimStatus
    sourceId?: string
  }) => Effect.Effect<ReadonlyArray<KnowledgeSchema.Claim>>
  readonly removeClaim: (projectID: ProjectSchema.ID, id: KnowledgeSchema.ClaimID) => Effect.Effect<boolean>
  readonly claimsAbout: (input: {
    projectID: ProjectSchema.ID
    entityId: KnowledgeSchema.EntityID
    limit?: number
  }) => Effect.Effect<ReadonlyArray<KnowledgeSchema.Claim>>

  readonly link: (input: KnowledgeSchema.EdgeInput) => Effect.Effect<KnowledgeSchema.Edge>
  readonly neighbors: (input: {
    projectID: ProjectSchema.ID
    nodeId: string
  }) => Effect.Effect<ReadonlyArray<Neighbor>>
  readonly removeEdge: (projectID: ProjectSchema.ID, id: KnowledgeSchema.EdgeID) => Effect.Effect<boolean>

  readonly context: (input?: {
    projectID: ProjectSchema.ID
    limit?: number
    query?: string
    topic?: string
  }) => Effect.Effect<Context | undefined>
  readonly clear: (projectID: ProjectSchema.ID) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@openresearch/Knowledge") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const db = (yield* Database.Service).db

    const upsertEntity = Effect.fn("Knowledge.upsertEntity")(function* (input: KnowledgeSchema.EntityInput) {
      const normalized = KnowledgeSchema.normalizeName(input.name)
      const existing = yield* db
        .select({ id: KnowledgeEntityTable.id })
        .from(KnowledgeEntityTable)
        .where(
          and(
            eq(KnowledgeEntityTable.project_id, input.projectID),
            eq(KnowledgeEntityTable.kind, input.kind),
            eq(KnowledgeEntityTable.normalized_name, normalized),
          ),
        )
        .get()
        .pipe(Effect.orDie)
      const id = existing?.id ?? KnowledgeSchema.EntityID.create()
      yield* db
        .insert(KnowledgeEntityTable)
        .values({
          id,
          project_id: input.projectID,
          kind: input.kind,
          name: input.name,
          normalized_name: normalized,
          description: input.description,
          aliases: [...(input.aliases ?? [])],
          external_ids: { ...(input.externalIds ?? {}) },
        })
        .onConflictDoUpdate({
          target: [KnowledgeEntityTable.project_id, KnowledgeEntityTable.kind, KnowledgeEntityTable.normalized_name],
          set: {
            name: input.name,
            description: input.description ?? null,
            aliases: [...(input.aliases ?? [])],
            external_ids: { ...(input.externalIds ?? {}) },
          },
        })
        .run()
        .pipe(Effect.orDie)
      const row = yield* db
        .select()
        .from(KnowledgeEntityTable)
        .where(eq(KnowledgeEntityTable.id, id))
        .get()
        .pipe(Effect.orDie)
      return toEntity(row!)
    })

    const getEntity = Effect.fn("Knowledge.getEntity")(function* (
      projectID: ProjectSchema.ID,
      id: KnowledgeSchema.EntityID,
    ) {
      const row = yield* db
        .select()
        .from(KnowledgeEntityTable)
        .where(and(eq(KnowledgeEntityTable.project_id, projectID), eq(KnowledgeEntityTable.id, id)))
        .get()
        .pipe(Effect.orDie)
      return row ? toEntity(row) : undefined
    })

    const findEntity = Effect.fn("Knowledge.findEntity")(function* (input: {
      projectID: ProjectSchema.ID
      name: string
      kind?: KnowledgeSchema.EntityKind
    }) {
      const normalized = KnowledgeSchema.normalizeName(input.name)
      const row = yield* db
        .select()
        .from(KnowledgeEntityTable)
        .where(
          and(
            eq(KnowledgeEntityTable.project_id, input.projectID),
            eq(KnowledgeEntityTable.normalized_name, normalized),
            ...(input.kind ? [eq(KnowledgeEntityTable.kind, input.kind)] : []),
          ),
        )
        .get()
        .pipe(Effect.orDie)
      return row ? toEntity(row) : undefined
    })

    const listEntities = Effect.fn("Knowledge.listEntities")(function* (projectID: ProjectSchema.ID) {
      const rows = yield* db
        .select()
        .from(KnowledgeEntityTable)
        .where(eq(KnowledgeEntityTable.project_id, projectID))
        .all()
        .pipe(Effect.orDie)
      return rows.map(toEntity)
    })

    const searchEntities = Effect.fn("Knowledge.searchEntities")(function* (input: {
      projectID: ProjectSchema.ID
      query: string
      kind?: KnowledgeSchema.EntityKind
      limit?: number
    }) {
      const needle = `%${input.query.trim().toLowerCase().replaceAll("%", "").replaceAll("_", "")}%`
      const rows = yield* db
        .select()
        .from(KnowledgeEntityTable)
        .where(
          and(
            eq(KnowledgeEntityTable.project_id, input.projectID),
            ...(input.kind ? [eq(KnowledgeEntityTable.kind, input.kind)] : []),
            or(like(KnowledgeEntityTable.normalized_name, needle), like(KnowledgeEntityTable.aliases, needle)),
          ),
        )
        .all()
        .pipe(Effect.orDie)
      return rows.map(toEntity).slice(0, input.limit ?? 20)
    })

    const removeEntity = Effect.fn("Knowledge.removeEntity")(function* (
      projectID: ProjectSchema.ID,
      id: KnowledgeSchema.EntityID,
    ) {
      const removed = yield* db
        .delete(KnowledgeEntityTable)
        .where(and(eq(KnowledgeEntityTable.project_id, projectID), eq(KnowledgeEntityTable.id, id)))
        .returning({ id: KnowledgeEntityTable.id })
        .get()
        .pipe(Effect.orDie)
      return removed !== undefined
    })

    const linkClaimEntities = Effect.fnUntraced(function* (
      projectID: ProjectSchema.ID,
      claimId: KnowledgeSchema.ClaimID,
      entityIds: readonly KnowledgeSchema.EntityID[],
    ) {
      yield* Effect.forEach(
        entityIds,
        (entityId) =>
          db
            .insert(KnowledgeEdgeTable)
            .values({
              id: KnowledgeSchema.EdgeID.create(),
              project_id: projectID,
              from_id: claimId,
              from_kind: "claim",
              to_id: entityId,
              to_kind: "entity",
              relation: "about",
            })
            .onConflictDoNothing()
            .run()
            .pipe(Effect.orDie),
        { discard: true },
      )
    })

    const addClaim = Effect.fn("Knowledge.addClaim")(function* (input: KnowledgeSchema.ClaimInput) {
      const id = KnowledgeSchema.ClaimID.create()
      yield* db
        .insert(KnowledgeClaimTable)
        .values({
          id,
          project_id: input.projectID,
          statement: input.statement,
          status: input.status ?? "unverified",
          confidence: input.confidence,
          as_of: input.asOf,
          source_id: input.sourceId,
          source_topic: input.sourceTopic,
          session_id: input.sessionId,
          origin_key: input.originKey,
        })
        .onConflictDoUpdate({
          target: [KnowledgeClaimTable.project_id, KnowledgeClaimTable.origin_key],
          set: {
            statement: input.statement,
            status: input.status ?? "unverified",
            confidence: input.confidence ?? null,
            as_of: input.asOf ?? null,
            source_id: input.sourceId ?? null,
            source_topic: input.sourceTopic ?? null,
            session_id: input.sessionId ?? null,
          },
        })
        .run()
        .pipe(Effect.orDie)
      // Re-select by origin so both insert and update paths return the stable row.
      const resolved = input.originKey
        ? yield* db
            .select({ id: KnowledgeClaimTable.id })
            .from(KnowledgeClaimTable)
            .where(
              and(
                eq(KnowledgeClaimTable.project_id, input.projectID),
                eq(KnowledgeClaimTable.origin_key, input.originKey),
              ),
            )
            .get()
            .pipe(Effect.orDie)
        : { id }
      const claimId = resolved?.id ?? id
      if (input.entityIds?.length) yield* linkClaimEntities(input.projectID, claimId, input.entityIds)
      const row = yield* db
        .select()
        .from(KnowledgeClaimTable)
        .where(eq(KnowledgeClaimTable.id, claimId))
        .get()
        .pipe(Effect.orDie)
      return toClaim(row!)
    })

    // Project a topic's evidence ledger into the knowledge graph. Claims are keyed by
    // (project, source_id, claim_id) so re-running updates instead of duplicating.
    const populateFromEvidence = Effect.fn("Knowledge.populateFromEvidence")(function* (input: {
      projectID: ProjectSchema.ID
      topic: string
      records: ReadonlyArray<{
        source_id: string
        claim_id: string
        claim: string
        verdict: KnowledgeSchema.ClaimStatus
        confidence?: KnowledgeSchema.Confidence
        source?: { title?: string; doi?: string; url?: string }
      }>
    }) {
      let entities = 0
      let claims = 0
      for (const record of input.records) {
        const entityIds: KnowledgeSchema.EntityID[] = []
        // Anchor each record to a publication entity when bibliographic identity exists.
        const anchor =
          record.source?.doi ?? record.source?.title ?? record.source?.url
            ? yield* upsertEntity({
                projectID: input.projectID,
                kind: "publication",
                name: record.source?.title ?? record.source?.doi ?? record.source?.url ?? "Source",
                externalIds: record.source?.doi ? { doi: record.source.doi } : undefined,
              })
            : undefined
        if (anchor) entityIds.push(anchor.id)
        entities += anchor ? 1 : 0
        yield* addClaim({
          projectID: input.projectID,
          statement: record.claim,
          status: record.verdict,
          confidence: record.confidence,
          sourceId: record.source_id,
          sourceTopic: input.topic,
          originKey: `${input.topic}:${record.source_id}:${record.claim_id}`,
          entityIds: entityIds.length ? entityIds : undefined,
        })
        claims += 1
      }
      return { entities, claims }
    })

    const getClaim = Effect.fn("Knowledge.getClaim")(function* (
      projectID: ProjectSchema.ID,
      id: KnowledgeSchema.ClaimID,
    ) {
      const row = yield* db
        .select()
        .from(KnowledgeClaimTable)
        .where(and(eq(KnowledgeClaimTable.project_id, projectID), eq(KnowledgeClaimTable.id, id)))
        .get()
        .pipe(Effect.orDie)
      return row ? toClaim(row) : undefined
    })

    const listClaims = Effect.fn("Knowledge.listClaims")(function* (input?: {
      projectID: ProjectSchema.ID
      status?: KnowledgeSchema.ClaimStatus
      sourceId?: string
    }) {
      if (!input) return []
      const rows = yield* db
        .select()
        .from(KnowledgeClaimTable)
        .where(
          and(
            eq(KnowledgeClaimTable.project_id, input.projectID),
            ...(input.status ? [eq(KnowledgeClaimTable.status, input.status)] : []),
            ...(input.sourceId ? [eq(KnowledgeClaimTable.source_id, input.sourceId)] : []),
          ),
        )
        .all()
        .pipe(Effect.orDie)
      return rows.map(toClaim)
    })

    const claimsAbout = Effect.fn("Knowledge.claimsAbout")(function* (input: {
      projectID: ProjectSchema.ID
      entityId: KnowledgeSchema.EntityID
      limit?: number
    }) {
      const edges = yield* db
        .select({ from_id: KnowledgeEdgeTable.from_id })
        .from(KnowledgeEdgeTable)
        .where(
          and(
            eq(KnowledgeEdgeTable.project_id, input.projectID),
            eq(KnowledgeEdgeTable.to_id, input.entityId),
            eq(KnowledgeEdgeTable.to_kind, "entity"),
            eq(KnowledgeEdgeTable.from_kind, "claim"),
          ),
        )
        .all()
        .pipe(Effect.orDie)
      const ids = edges.map((edge) => edge.from_id) as KnowledgeSchema.ClaimID[]
      if (ids.length === 0) return []
      const rows = yield* db
        .select()
        .from(KnowledgeClaimTable)
        .where(and(eq(KnowledgeClaimTable.project_id, input.projectID), inArray(KnowledgeClaimTable.id, ids)))
        .all()
        .pipe(Effect.orDie)
      return rows.map(toClaim).slice(0, input.limit ?? 20)
    })

    const removeClaim = Effect.fn("Knowledge.removeClaim")(function* (
      projectID: ProjectSchema.ID,
      id: KnowledgeSchema.ClaimID,
    ) {
      const removed = yield* db
        .delete(KnowledgeClaimTable)
        .where(and(eq(KnowledgeClaimTable.project_id, projectID), eq(KnowledgeClaimTable.id, id)))
        .returning({ id: KnowledgeClaimTable.id })
        .get()
        .pipe(Effect.orDie)
      if (removed === undefined) return false
      yield* db
        .delete(KnowledgeEdgeTable)
        .where(
          and(
            eq(KnowledgeEdgeTable.project_id, projectID),
            eq(KnowledgeEdgeTable.from_kind, "claim"),
            eq(KnowledgeEdgeTable.from_id, id),
          ),
        )
        .run()
        .pipe(Effect.orDie)
      return true
    })

    const link = Effect.fn("Knowledge.link")(function* (input: KnowledgeSchema.EdgeInput) {
      const row = yield* db
        .insert(KnowledgeEdgeTable)
        .values({
          id: KnowledgeSchema.EdgeID.create(),
          project_id: input.projectID,
          from_id: input.fromId,
          from_kind: input.fromKind,
          to_id: input.toId,
          to_kind: input.toKind,
          relation: input.relation,
        })
        .onConflictDoUpdate({
          target: [
            KnowledgeEdgeTable.project_id,
            KnowledgeEdgeTable.from_id,
            KnowledgeEdgeTable.to_id,
            KnowledgeEdgeTable.relation,
          ],
          set: { from_kind: input.fromKind, to_kind: input.toKind },
        })
        .returning()
        .get()
        .pipe(Effect.orDie)
      return toEdge(row!)
    })

    const neighbors = Effect.fn("Knowledge.neighbors")(function* (input: {
      projectID: ProjectSchema.ID
      nodeId: string
    }) {
      const fromRows = yield* db
        .select()
        .from(KnowledgeEdgeTable)
        .where(
          and(
            eq(KnowledgeEdgeTable.project_id, input.projectID),
            eq(KnowledgeEdgeTable.from_id, input.nodeId),
          ),
        )
        .all()
        .pipe(Effect.orDie)
      const toRows = yield* db
        .select()
        .from(KnowledgeEdgeTable)
        .where(and(eq(KnowledgeEdgeTable.project_id, input.projectID), eq(KnowledgeEdgeTable.to_id, input.nodeId)))
        .all()
        .pipe(Effect.orDie)
      return [
        ...fromRows.map((row): Neighbor => ({ edge: toEdge(row), node: { id: row.to_id, kind: row.to_kind } })),
        ...toRows.map((row): Neighbor => ({ edge: toEdge(row), node: { id: row.from_id, kind: row.from_kind } })),
      ]
    })

    const removeEdge = Effect.fn("Knowledge.removeEdge")(function* (
      projectID: ProjectSchema.ID,
      id: KnowledgeSchema.EdgeID,
    ) {
      const removed = yield* db
        .delete(KnowledgeEdgeTable)
        .where(and(eq(KnowledgeEdgeTable.project_id, projectID), eq(KnowledgeEdgeTable.id, id)))
        .returning({ id: KnowledgeEdgeTable.id })
        .get()
        .pipe(Effect.orDie)
      return removed !== undefined
    })

    const toContextClaim = (row: ClaimRow): ContextClaim => ({
      id: row.id,
      statement: row.statement,
      status: row.status,
      confidence: row.confidence ?? undefined,
      source_id: row.source_id ?? undefined,
      source_topic: row.source_topic ?? undefined,
    })

    const context = Effect.fn("Knowledge.context")(function* (input?: {
      projectID: ProjectSchema.ID
      limit?: number
      query?: string
      topic?: string
    }) {
      if (!input) return undefined
      const limit = input.limit ?? 20
      const tokens = KnowledgeRelevance.tokenize(input.query)
      const [claimCount, entityCount, edgeCount] = yield* Effect.all([
        db
          .select({ id: KnowledgeClaimTable.id })
          .from(KnowledgeClaimTable)
          .where(eq(KnowledgeClaimTable.project_id, input.projectID))
          .all(),
        db
          .select({ id: KnowledgeEntityTable.id })
          .from(KnowledgeEntityTable)
          .where(eq(KnowledgeEntityTable.project_id, input.projectID))
          .all(),
        db
          .select({ id: KnowledgeEdgeTable.id })
          .from(KnowledgeEdgeTable)
          .where(eq(KnowledgeEdgeTable.project_id, input.projectID))
          .all(),
      ]).pipe(Effect.orDie)

      const allClaims = yield* db
        .select()
        .from(KnowledgeClaimTable)
        .where(eq(KnowledgeClaimTable.project_id, input.projectID))
        .all()
        .pipe(Effect.orDie)
      const allEntities = yield* db
        .select()
        .from(KnowledgeEntityTable)
        .where(eq(KnowledgeEntityTable.project_id, input.projectID))
        .all()
        .pipe(Effect.orDie)
      const allEdges = yield* db
        .select()
        .from(KnowledgeEdgeTable)
        .where(eq(KnowledgeEdgeTable.project_id, input.projectID))
        .all()
        .pipe(Effect.orDie)

      // Rank by relevance when a query/topic is supplied, else by recency.
      const queryText = tokens.length > 0 || input.topic ? { tokens, topic: input.topic } : undefined
      const claimRank = (row: ClaimRow) => {
        if (!queryText) return 0
        const topicBoost = input.topic && row.source_topic === input.topic ? 3 : 0
        return (
          KnowledgeRelevance.claimScore({
            tokens: queryText.tokens,
            statement: row.statement,
            sourceTopic: row.source_topic ?? undefined,
            status: row.status,
          }) + topicBoost
        )
      }
      const claimOrder = (a: ClaimRow, b: ClaimRow) => claimRank(b) - claimRank(a) || b.time_created - a.time_created

      // Entity co-occurrence: how many of the ranked claims each entity is about.
      const cooccurrence = new Map<string, number>()
      for (const edge of allEdges) {
        if (edge.from_kind === "claim" && edge.to_kind === "entity") {
          cooccurrence.set(edge.to_id, (cooccurrence.get(edge.to_id) ?? 0) + 1)
        }
      }
      const entityRank = (row: EntityRow) => {
        if (!queryText) return 0
        return KnowledgeRelevance.entityScore({
          tokens: queryText.tokens,
          name: row.name,
          aliases: row.aliases ?? [],
          cooccurrence: cooccurrence.get(row.id) ?? 0,
        })
      }
      const entityOrder = (a: EntityRow, b: EntityRow) =>
        entityRank(b) - entityRank(a) || b.time_created - a.time_created

      // Contradictions first: they are the most decision-relevant prior knowledge.
      const contradictions = allClaims
        .filter((row) => row.status === "contradicted")
        .toSorted(claimOrder)
        .slice(0, limit)
        .map(toContextClaim)
      const claims = allClaims
        .filter((row) => row.status !== "contradicted")
        .toSorted(claimOrder)
        .slice(0, limit)
        .map(toContextClaim)
      const entities = allEntities
        .toSorted(entityOrder)
        .slice(0, limit)
        .map((row): ContextEntity => ({ id: row.id, kind: row.kind, name: row.name }))

      if (claimCount.length === 0 && entityCount.length === 0 && edgeCount.length === 0) return undefined

      return {
        counts: { entities: entityCount.length, claims: claimCount.length, edges: edgeCount.length },
        contradictions,
        claims,
        entities,
      } satisfies Context
    })

    const clear = Effect.fn("Knowledge.clear")(function* (projectID: ProjectSchema.ID) {
      yield* db
        .delete(KnowledgeEdgeTable)
        .where(eq(KnowledgeEdgeTable.project_id, projectID))
        .run()
        .pipe(Effect.orDie)
      yield* db
        .delete(KnowledgeClaimTable)
        .where(eq(KnowledgeClaimTable.project_id, projectID))
        .run()
        .pipe(Effect.orDie)
      yield* db
        .delete(KnowledgeEntityTable)
        .where(eq(KnowledgeEntityTable.project_id, projectID))
        .run()
        .pipe(Effect.orDie)
    })

    return Service.of({
      upsertEntity,
      getEntity,
      findEntity,
      listEntities,
      searchEntities,
      removeEntity,
      addClaim,
      populateFromEvidence,
      getClaim,
      listClaims,
      claimsAbout,
      removeClaim,
      link,
      neighbors,
      removeEdge,
      context,
      clear,
    })
  }),
)

export const node = makeGlobalNode({ service: Service, layer: layer, deps: [Database.node] })
