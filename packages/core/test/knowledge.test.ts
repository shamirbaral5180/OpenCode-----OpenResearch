import { describe, expect } from "bun:test"
import { Effect } from "effect"
import { Database } from "@openresearch-ai/core/database/database"
import { LayerNode } from "@openresearch-ai/core/effect/layer-node"
import { AppNodeBuilder } from "@openresearch-ai/core/effect/app-node-builder"
import { Knowledge } from "@openresearch-ai/core/knowledge/knowledge"
import { KnowledgeSchema } from "@openresearch-ai/core/knowledge/schema"
import { Project } from "@openresearch-ai/core/project"
import { ProjectTable } from "@openresearch-ai/core/project/sql"
import { AbsolutePath } from "@openresearch-ai/core/schema"
import { testEffect } from "./lib/effect"

const it = testEffect(AppNodeBuilder.build(LayerNode.group([Database.node, Knowledge.node])))

const projectA = Project.ID.make("knowledge-project-a")
const projectB = Project.ID.make("knowledge-project-b")

function setup() {
  return Database.Service.use(({ db }) =>
    db
      .insert(ProjectTable)
      .values([
        { id: projectA, worktree: AbsolutePath.make("/tmp/kb-a"), sandboxes: [], time_created: 1, time_updated: 1 },
        { id: projectB, worktree: AbsolutePath.make("/tmp/kb-b"), sandboxes: [], time_created: 1, time_updated: 1 },
      ])
      .onConflictDoNothing()
      .run()
      .pipe(Effect.orDie),
  )
}

describe("Knowledge schema", () => {
  it.effect("normalizes names for dedupe", () =>
    Effect.sync(() => {
      expect(KnowledgeSchema.normalizeName("  Example   Corp ")).toBe("example corp")
    }),
  )
})

describe("Knowledge service", () => {
  it.effect("upserts entities by kind and normalized name", () =>
    Effect.gen(function* () {
      yield* setup()
      const knowledge = yield* Knowledge.Service

      const first = yield* knowledge.upsertEntity({ projectID: projectA, kind: "organization", name: "Example Corp" })
      const second = yield* knowledge.upsertEntity({
        projectID: projectA,
        kind: "organization",
        name: "example   corp",
        description: "updated",
      })

      expect(second.id).toBe(first.id)
      expect(second.name).toBe("example   corp")
      expect(second.description).toBe("updated")
      expect(yield* knowledge.listEntities(projectA)).toHaveLength(1)
    }),
  )

  it.effect("scopes entities and claims per project", () =>
    Effect.gen(function* () {
      yield* setup()
      const knowledge = yield* Knowledge.Service

      yield* knowledge.upsertEntity({ projectID: projectA, kind: "concept", name: "Shared Name" })
      yield* knowledge.upsertEntity({ projectID: projectB, kind: "concept", name: "Shared Name" })

      const a = yield* knowledge.listEntities(projectA)
      const b = yield* knowledge.listEntities(projectB)
      expect(a).toHaveLength(1)
      expect(b).toHaveLength(1)
      expect(a[0]!.id).not.toBe(b[0]!.id)

      yield* knowledge.addClaim({ projectID: projectA, statement: "A-only claim" })
      expect(yield* knowledge.listClaims({ projectID: projectA })).toHaveLength(1)
      expect(yield* knowledge.listClaims({ projectID: projectB })).toHaveLength(0)
    }),
  )

  it.effect("filters claims by status and source", () =>
    Effect.gen(function* () {
      yield* setup()
      const knowledge = yield* Knowledge.Service

      yield* knowledge.addClaim({ projectID: projectA, statement: "one", status: "verified", sourceId: "S1" })
      yield* knowledge.addClaim({ projectID: projectA, statement: "two", status: "unverified", sourceId: "S2" })

      expect(yield* knowledge.listClaims({ projectID: projectA, status: "verified" })).toHaveLength(1)
      expect(yield* knowledge.listClaims({ projectID: projectA, sourceId: "S2" })).toHaveLength(1)
      expect(yield* knowledge.listClaims({ projectID: projectB, status: "verified" })).toHaveLength(0)
    }),
  )

  it.effect("links claims to entities and returns neighbors", () =>
    Effect.gen(function* () {
      yield* setup()
      const knowledge = yield* Knowledge.Service

      const entity = yield* knowledge.upsertEntity({ projectID: projectA, kind: "person", name: "Ada" })
      const claim = yield* knowledge.addClaim({
        projectID: projectA,
        statement: "Ada wrote the note",
        entityIds: [entity.id],
      })

      const neighbors = yield* knowledge.neighbors({ projectID: projectA, nodeId: claim.id })
      expect(neighbors).toHaveLength(1)
      expect(neighbors[0]!.node).toEqual({ id: entity.id, kind: "entity" })
      expect(neighbors[0]!.edge.relation).toBe("about")

      // Neighbor lookups are project-scoped.
      expect(yield* knowledge.neighbors({ projectID: projectB, nodeId: claim.id })).toHaveLength(0)
    }),
  )

  it.effect("deduplicates identical edges", () =>
    Effect.gen(function* () {
      yield* setup()
      const knowledge = yield* Knowledge.Service

      const from = yield* knowledge.upsertEntity({ projectID: projectA, kind: "person", name: "Grace" })
      const to = yield* knowledge.upsertEntity({ projectID: projectA, kind: "organization", name: "Navy" })
      const input = {
        projectID: projectA,
        fromId: from.id,
        fromKind: "entity" as const,
        toId: to.id,
        toKind: "entity" as const,
        relation: "worked-for",
      }

      const first = yield* knowledge.link(input)
      const second = yield* knowledge.link(input)
      expect(second.id).toBe(first.id)
      expect(yield* knowledge.neighbors({ projectID: projectA, nodeId: from.id })).toHaveLength(1)
    }),
  )

  it.effect("removes a claim and its edges", () =>
    Effect.gen(function* () {
      yield* setup()
      const knowledge = yield* Knowledge.Service

      const entity = yield* knowledge.upsertEntity({ projectID: projectA, kind: "concept", name: "X" })
      const claim = yield* knowledge.addClaim({ projectID: projectA, statement: "Y", entityIds: [entity.id] })

      expect(yield* knowledge.removeClaim(projectA, claim.id)).toBe(true)
      expect(yield* knowledge.getClaim(projectA, claim.id)).toBeUndefined()
      expect(yield* knowledge.neighbors({ projectID: projectA, nodeId: entity.id })).toHaveLength(0)
    }),
  )

  it.effect("clear removes only the target project's graph", () =>
    Effect.gen(function* () {
      yield* setup()
      const knowledge = yield* Knowledge.Service

      yield* knowledge.upsertEntity({ projectID: projectA, kind: "concept", name: "A" })
      yield* knowledge.addClaim({ projectID: projectA, statement: "claim A" })
      yield* knowledge.upsertEntity({ projectID: projectB, kind: "concept", name: "B" })

      yield* knowledge.clear(projectA)
      expect(yield* knowledge.listEntities(projectA)).toHaveLength(0)
      expect(yield* knowledge.listClaims({ projectID: projectA })).toHaveLength(0)
      expect(yield* knowledge.listEntities(projectB)).toHaveLength(1)
    }),
  )

  it.effect("addClaim upserts by origin key instead of duplicating", () =>
    Effect.gen(function* () {
      yield* setup()
      const knowledge = yield* Knowledge.Service

      const first = yield* knowledge.addClaim({
        projectID: projectA,
        statement: "Initial wording",
        status: "unverified",
        originKey: "topic:S1:C1",
      })
      const second = yield* knowledge.addClaim({
        projectID: projectA,
        statement: "Corrected wording",
        status: "verified",
        originKey: "topic:S1:C1",
      })

      expect(second.id).toBe(first.id)
      expect(second.statement).toBe("Corrected wording")
      expect(second.status).toBe("verified")
      expect(yield* knowledge.listClaims({ projectID: projectA })).toHaveLength(1)
    }),
  )

  it.effect("populateFromEvidence projects ledger records into entities and claims", () =>
    Effect.gen(function* () {
      yield* setup()
      const knowledge = yield* Knowledge.Service

      const result = yield* knowledge.populateFromEvidence({
        projectID: projectA,
        topic: "topic",
        records: [
          {
            source_id: "S1",
            claim_id: "C1",
            claim: "The sky is blue",
            verdict: "verified",
            confidence: "high",
            source: { title: "Atmosphere", doi: "10.1/abc" },
          },
          {
            source_id: "S2",
            claim_id: "C2",
            claim: "The sky is green",
            verdict: "contradicted",
            source: { title: "Counterexample", url: "https://example.org/x" },
          },
        ],
      })
      expect(result.claims).toBe(2)
      expect(result.entities).toBe(2)

      const claims = yield* knowledge.listClaims({ projectID: projectA })
      expect(claims).toHaveLength(2)
      expect(claims.every((claim) => claim.origin_key)).toBe(true)
      expect(claims.some((claim) => claim.status === "contradicted")).toBe(true)

      const publications = (yield* knowledge.listEntities(projectA)).filter((entity) => entity.kind === "publication")
      expect(publications).toHaveLength(2)

      // Re-populating the same ledger must not duplicate, and must update verdicts.
      yield* knowledge.populateFromEvidence({
        projectID: projectA,
        topic: "topic",
        records: [
          {
            source_id: "S1",
            claim_id: "C1",
            claim: "The sky is blue",
            verdict: "partial",
            source: { title: "Atmosphere", doi: "10.1/abc" },
          },
        ],
      })
      const after = yield* knowledge.listClaims({ projectID: projectA, sourceId: "S1" })
      expect(after).toHaveLength(1)
      expect(after[0]!.status).toBe("partial")
    }),
  )

  it.effect("populateFromEvidence anchors claims to their source publication", () =>
    Effect.gen(function* () {
      yield* setup()
      const knowledge = yield* Knowledge.Service

      const result = yield* knowledge.populateFromEvidence({
        projectID: projectA,
        topic: "topic",
        records: [
          {
            source_id: "S1",
            claim_id: "C1",
            claim: "Findings",
            verdict: "verified",
            source: { title: "Paper", doi: "10.1/xyz" },
          },
        ],
      })
      expect(result.entities).toBe(1)

      const claims = yield* knowledge.listClaims({ projectID: projectA })
      const neighbors = yield* knowledge.neighbors({ projectID: projectA, nodeId: claims[0]!.id })
      expect(neighbors).toHaveLength(1)
      expect(neighbors[0]!.node.kind).toBe("entity")
      expect(neighbors[0]!.edge.relation).toBe("about")
    }),
  )
})
