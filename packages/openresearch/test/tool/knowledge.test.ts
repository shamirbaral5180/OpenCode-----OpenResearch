import { describe, expect } from "bun:test"
import { Effect } from "effect"
import { LayerNode } from "@openresearch-ai/core/effect/layer-node"
import { Knowledge } from "@openresearch-ai/core/knowledge/knowledge"
import { Truncate } from "@/tool/truncate"
import { Agent } from "../../src/agent/agent"
import { KnowledgeTool } from "../../src/tool/knowledge"
import { Tool } from "../../src/tool/tool"
import { SessionID, MessageID } from "../../src/session/schema"
import { InstanceState } from "../../src/effect/instance-state"
import { TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(LayerNode.compile(LayerNode.group([Knowledge.node, Truncate.node, Agent.node])))

const baseCtx = {
  sessionID: SessionID.make("ses_test"),
  messageID: MessageID.make("msg_test"),
  callID: "",
  agent: "research",
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => Effect.void,
  ask: () => Effect.void,
}

const run = (input: Tool.InferParameters<typeof KnowledgeTool>) =>
  Effect.gen(function* () {
    const info = yield* KnowledgeTool
    const tool = yield* info.init()
    return yield* tool.execute(input, baseCtx)
  })

describe("knowledge tool", () => {
  it.instance("adds entities and claims, then queries them back", () =>
    Effect.gen(function* () {
      const instance = yield* InstanceState.context
      yield* run({ action: "add_entity", name: "Ada Lovelace", kind: "person", aliases: ["Countess"] })
      const found = yield* run({ action: "find_entity", query: "countess" })
      const entities = (JSON.parse(found.output) as { entities: { id: string; name: string }[] }).entities
      expect(entities).toHaveLength(1)
      expect(entities[0]!.name).toBe("Ada Lovelace")

      yield* run({
        action: "add_claim",
        statement: "Ada wrote the first algorithm",
        status: "verified",
        entity_id: entities[0]!.id,
      })
      const listed = yield* run({ action: "list_claims", entity_id: entities[0]!.id })
      const claims = (JSON.parse(listed.output) as { claims: { statement: string }[] }).claims
      expect(claims).toHaveLength(1)

      const knowledge = yield* Knowledge.Service
      expect(yield* knowledge.listClaims({ projectID: instance.project.id })).toHaveLength(1)
    }),
  )

  it.instance("lists claims filtered by status and links nodes", () =>
    Effect.gen(function* () {
      yield* run({ action: "add_entity", name: "Grace Hopper", kind: "person" })
      const found = yield* run({ action: "find_entity", query: "grace" })
      const entity = (JSON.parse(found.output) as { entities: { id: string }[] }).entities[0]!
      yield* run({ action: "add_entity", name: "US Navy", kind: "organization" })
      const org = (JSON.parse((yield* run({ action: "find_entity", query: "navy" })).output) as {
        entities: { id: string }[]
      }).entities[0]!

      yield* run({ action: "link", from_id: entity.id, to_id: org.id, relation: "worked-for" })
      const neighbors = yield* run({ action: "neighbors", node_id: entity.id })
      const list = (JSON.parse(neighbors.output) as { neighbors: { edge: { relation: string } }[] }).neighbors
      expect(list).toHaveLength(1)
      expect(list[0]!.edge.relation).toBe("worked-for")

      yield* run({ action: "add_claim", statement: "unverified thing" })
      const verified = yield* run({ action: "list_claims", status: "verified" })
      expect((JSON.parse(verified.output) as { claims: unknown[] }).claims).toHaveLength(0)
      const unverified = yield* run({ action: "list_claims", status: "unverified" })
      expect((JSON.parse(unverified.output) as { claims: unknown[] }).claims).toHaveLength(1)
    }),
  )

  it.instance("reports validation errors for missing required fields", () =>
    Effect.gen(function* () {
      const result = yield* run({ action: "find_entity" })
      const metadata = result.metadata as { error?: string }
      expect(metadata.error).toContain("query is required")
    }),
  )
})
