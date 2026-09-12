export * as Knowledge from "./knowledge"

import { and, eq } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"
import { Database } from "../database/database"
import { makeGlobalNode } from "../effect/app-node"
import { ProjectSchema } from "../project/schema"
import { KnowledgeSchema } from "./schema"
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

export interface Interface {
  readonly upsertEntity: (input: KnowledgeSchema.EntityInput) => Effect.Effect<KnowledgeSchema.Entity>
  readonly getEntity: (projectID: ProjectSchema.ID, id: KnowledgeSchema.EntityID) => Effect.Effect<KnowledgeSchema.Entity | undefined>
  readonly findEntity: (input: {
    projectID: ProjectSchema.ID
    name: string
    kind?: KnowledgeSchema.EntityKind
  }) => Effect.Effect<KnowledgeSchema.Entity | undefined>
  readonly listEntities: (projectID: ProjectSchema.ID) => Effect.Effect<ReadonlyArray<KnowledgeSchema.Entity>>
  readonly removeEntity: (projectID: ProjectSchema.ID, id: KnowledgeSchema.EntityID) => Effect.Effect<boolean>

  readonly addClaim: (input: KnowledgeSchema.ClaimInput) => Effect.Effect<KnowledgeSchema.Claim>
  readonly getClaim: (projectID: ProjectSchema.ID, id: KnowledgeSchema.ClaimID) => Effect.Effect<KnowledgeSchema.Claim | undefined>
  readonly listClaims: (input?: {
    projectID: ProjectSchema.ID
    status?: KnowledgeSchema.ClaimStatus
    sourceId?: string
  }) => Effect.Effect<ReadonlyArray<KnowledgeSchema.Claim>>
  readonly removeClaim: (projectID: ProjectSchema.ID, id: KnowledgeSchema.ClaimID) => Effect.Effect<boolean>

  readonly link: (input: KnowledgeSchema.EdgeInput) => Effect.Effect<KnowledgeSchema.Edge>
  readonly neighbors: (input: {
    projectID: ProjectSchema.ID
    nodeId: string
  }) => Effect.Effect<ReadonlyArray<Neighbor>>
  readonly removeEdge: (projectID: ProjectSchema.ID, id: KnowledgeSchema.EdgeID) => Effect.Effect<boolean>

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
        })
        .run()
        .pipe(Effect.orDie)
      if (input.entityIds?.length) {
        yield* Effect.forEach(
          input.entityIds,
          (entityId) =>
            db
              .insert(KnowledgeEdgeTable)
              .values({
                id: KnowledgeSchema.EdgeID.create(),
                project_id: input.projectID,
                from_id: id,
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
      }
      const row = yield* db
        .select()
        .from(KnowledgeClaimTable)
        .where(eq(KnowledgeClaimTable.id, id))
        .get()
        .pipe(Effect.orDie)
      return toClaim(row!)
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
      removeEntity,
      addClaim,
      getClaim,
      listClaims,
      removeClaim,
      link,
      neighbors,
      removeEdge,
      clear,
    })
  }),
)

export const node = makeGlobalNode({ service: Service, layer: layer, deps: [Database.node] })
