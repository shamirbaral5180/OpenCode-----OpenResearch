import { describe, expect, test } from "bun:test"
import { KnowledgeRelevance } from "@openresearch-ai/core/knowledge/relevance"

describe("KnowledgeRelevance", () => {
  test("tokenize lowercases, drops stopwords, short tokens, and dedupes", () => {
    expect(KnowledgeRelevance.tokenize("The Quick brown fox and the Fox")).toEqual(["quick", "brown", "fox"])
    expect(KnowledgeRelevance.tokenize(undefined)).toEqual([])
  })

  test("overlap counts query tokens present in text", () => {
    const tokens = KnowledgeRelevance.tokenize("tuition waiver")
    expect(KnowledgeRelevance.overlap(tokens, "The tuition waiver is $9000")).toBe(2)
    expect(KnowledgeRelevance.overlap(tokens, "unrelated text")).toBe(0)
  })

  test("claimScore favors contradictions at equal keyword overlap", () => {
    const tokens = KnowledgeRelevance.tokenize("tuition")
    const verified = KnowledgeRelevance.claimScore({ tokens, statement: "tuition is high", status: "verified" })
    const contradicted = KnowledgeRelevance.claimScore({
      tokens,
      statement: "tuition is high",
      status: "contradicted",
    })
    expect(contradicted).toBeGreaterThan(verified)
  })

  test("claimScore weights topic matches and keyword hits", () => {
    const tokens = KnowledgeRelevance.tokenize("scholarship gpa")
    const onTopic = KnowledgeRelevance.claimScore({
      tokens,
      statement: "The scholarship requires a 3.10 GPA",
      sourceTopic: "troy-scholarships",
      status: "verified",
    })
    const offTopic = KnowledgeRelevance.claimScore({
      tokens,
      statement: "Unrelated housing note",
      status: "verified",
    })
    expect(onTopic).toBeGreaterThan(offTopic)
  })

  test("entityScore weights aliases and co-occurrence", () => {
    const tokens = KnowledgeRelevance.tokenize("troy")
    const named = KnowledgeRelevance.entityScore({ tokens, name: "Troy University", cooccurrence: 0 })
    const aliased = KnowledgeRelevance.entityScore({
      tokens,
      name: "Example Corp",
      aliases: ["Troy"],
      cooccurrence: 0,
    })
    const connected = KnowledgeRelevance.entityScore({ tokens, name: "Example Corp", cooccurrence: 5 })
    expect(named).toBeGreaterThan(0)
    expect(aliased).toBeGreaterThan(0)
    expect(connected).toBe(5)
  })
})
