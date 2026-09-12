import { describe, expect, test } from "bun:test"
import { normalizeDoi, isDoiLike, normalizeText, quoteMatch } from "../../src/tool/verification"

describe("verification helpers", () => {
  test("normalizeDoi strips common prefixes and whitespace", () => {
    expect(normalizeDoi("https://doi.org/10.1038/nature12373")).toBe("10.1038/nature12373")
    expect(normalizeDoi("doi:10.1000/xyz")).toBe("10.1000/xyz")
    expect(normalizeDoi("  10.5555/abc  ")).toBe("10.5555/abc")
  })

  test("isDoiLike accepts real DOIs and rejects malformed values", () => {
    expect(isDoiLike("10.1038/nature12373")).toBe(true)
    expect(isDoiLike("doi:10.1000/xyz")).toBe(true)
    expect(isDoiLike("not-a-doi")).toBe(false)
    expect(isDoiLike("10.1/x")).toBe(false)
  })

  test("normalizeText collapses whitespace and strips markup", () => {
    expect(normalizeText("<p>Hello\u00a0  world</p>")).toBe("Hello world")
  })

  test("quoteMatch accepts exact matches", () => {
    const match = quoteMatch("The quick brown fox jumps.", "quick brown fox")
    expect(match.matched).toBe(true)
    expect(match.kind).toBe("exact")
  })

  test("quoteMatch tolerates conservative whitespace/punctuation drift", () => {
    const source = "The quick brown fox jumps over the lazy dog."
    const match = quoteMatch(source, "quick brown fox jumps over the lazy dog")
    expect(match.matched).toBe(true)
    expect(match.kind === "exact" || match.kind === "fuzzy").toBe(true)
  })

  test("quoteMatch rejects an absent quotation", () => {
    const match = quoteMatch("Completely unrelated content here.", "quick brown fox jumps")
    expect(match.matched).toBe(false)
    expect(match.kind).toBe("none")
  })

  test("quoteMatch does not fuzzy-match short ambiguous quotes on a few tokens", () => {
    const match = quoteMatch("A study of the many worldly things today.", "the world things")
    expect(match.matched).toBe(false)
  })

  test("quoteMatch treats an empty quotation as empty, never a match", () => {
    const match = quoteMatch("some source text", "   ")
    expect(match.matched).toBe(false)
    expect(match.kind).toBe("empty")
  })
})
