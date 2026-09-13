export * as KnowledgeRelevance from "./relevance"

// Lightweight, deterministic relevance scoring for prior knowledge. There are no
// embeddings yet, so relevance is token overlap plus graph co-occurrence. This is
// intentionally simple and cheap; it only has to rank items stably, not be perfect.

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "are",
  "but",
  "not",
  "you",
  "all",
  "any",
  "can",
  "had",
  "her",
  "was",
  "one",
  "our",
  "out",
  "day",
  "get",
  "has",
  "him",
  "his",
  "how",
  "its",
  "may",
  "new",
  "now",
  "old",
  "see",
  "two",
  "way",
  "who",
  "boy",
  "did",
  "she",
  "use",
  "that",
  "this",
  "with",
  "from",
  "they",
  "will",
  "would",
  "there",
  "their",
  "what",
  "about",
  "which",
  "when",
  "make",
  "like",
  "time",
  "just",
  "know",
  "take",
  "into",
  "your",
  "some",
  "them",
  "than",
  "then",
  "only",
  "come",
  "over",
  "also",
  "back",
  "after",
  "could",
  "been",
  "were",
  "have",
  "does",
  "each",
  "more",
  "most",
  "other",
  "should",
])

export function tokenize(text: string | undefined): string[] {
  if (!text) return []
  const seen = new Set<string>()
  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 3) continue
    if (STOPWORDS.has(raw)) continue
    seen.add(raw)
  }
  return Array.from(seen)
}

// Count how many query tokens appear in the target text.
export function overlap(tokens: readonly string[], text: string | undefined): number {
  if (!text || tokens.length === 0) return 0
  const haystack = text.toLowerCase()
  let score = 0
  for (const token of tokens) if (haystack.includes(token)) score++
  return score
}

const STATUS_WEIGHT: Record<string, number> = {
  contradicted: 2,
  partial: 1,
  verified: 0,
  unverified: 0,
}

export function claimScore(input: {
  tokens: readonly string[]
  statement: string
  sourceTopic?: string
  status: string
}): number {
  return (
    overlap(input.tokens, input.statement) +
    overlap(input.tokens, input.sourceTopic) +
    (STATUS_WEIGHT[input.status] ?? 0)
  )
}

export function entityScore(input: {
  tokens: readonly string[]
  name: string
  aliases?: readonly string[]
  cooccurrence: number
}): number {
  const aliasHits = (input.aliases ?? []).reduce((total, alias) => total + overlap(input.tokens, alias), 0)
  return overlap(input.tokens, input.name) + aliasHits + input.cooccurrence
}
