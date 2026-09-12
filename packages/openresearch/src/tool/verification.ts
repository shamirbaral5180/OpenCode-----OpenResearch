export * as ToolVerification from "./verification"

import { Effect } from "effect"
import { HttpClient, HttpClientRequest } from "effect/unstable/http"

const USER_AGENT = "openresearch-verifier/1.0"
const DEFAULT_TIMEOUT = 20_000

export type FetchText = {
  readonly url: string
  readonly finalUrl: string
  readonly status: number
  readonly contentType: string
  readonly ok: boolean
  readonly text: string
}

const TEXT_TYPES = ["text/", "application/json", "application/xml", "application/xhtml", "application/rss"]

export const normalizeText = (value: string) =>
  value
    .replace(/<[^>]*>/g, " ")
    .replace(/[“”„‟]/g, '"')
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[\u00a0\u2000-\u200a\u202f\u205f\u3000]/g, " ")
    .replace(/\s+/g, " ")
    .trim()

export const tokenize = (value: string) =>
  normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(" ")
    .filter((token) => token.length > 1)

// Exact match first, then a deliberately conservative fuzzy ratio. Never invents a match.
export function quoteMatch(haystack: string, quote: string, minOverlap = 0.9) {
  const normalizedHaystack = normalizeText(haystack)
  const normalizedQuote = normalizeText(quote)
  if (!normalizedQuote) return { matched: false, kind: "empty" as const, overlap: 0 }
  if (normalizedHaystack.includes(normalizedQuote)) return { matched: true, kind: "exact" as const, overlap: 1 }

  const haystackTokens = new Set(tokenize(normalizedHaystack))
  const quoteTokens = tokenize(normalizedQuote)
  if (quoteTokens.length === 0) return { matched: false, kind: "empty" as const, overlap: 0 }
  const overlap = quoteTokens.filter((token) => haystackTokens.has(token)).length / quoteTokens.length
  if (overlap < minOverlap) return { matched: false, kind: "none" as const, overlap }

  // Guard against short/ambiguous quotes matching on a few common tokens.
  const lengthRatio =
    Math.min(normalizedQuote.length, normalizedHaystack.length) /
    Math.max(normalizedQuote.length, normalizedHaystack.length)
  if (lengthRatio < 0.5 || quoteTokens.length < 4) return { matched: false, kind: "none" as const, overlap }
  return { matched: true, kind: "fuzzy" as const, overlap }
}

export const fetchText = (http: HttpClient.HttpClient, url: string, headers?: Record<string, string>) =>
  Effect.gen(function* () {
    const request = HttpClientRequest.get(url).pipe(
      HttpClientRequest.setHeaders({
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/json,text/plain;q=0.9,*/*;q=0.5",
        ...(headers ?? {}),
      }),
    )
    const response = yield* http.execute(request)
    const contentType = (response.headers["content-type"] ?? "").split(";")[0]?.trim() ?? ""
    const status = response.status
    const finalUrl = request.url

    if (status < 200 || status >= 300) {
      return { url, finalUrl, status, contentType, ok: false, text: "" } satisfies FetchText
    }
    if (contentType && !TEXT_TYPES.some((type) => contentType.startsWith(type))) {
      return { url, finalUrl, status, contentType, ok: true, text: "" } satisfies FetchText
    }
    const text = yield* response.text.pipe(Effect.catch(() => Effect.succeed("")))
    return { url, finalUrl, status, contentType, ok: true, text } satisfies FetchText
  }).pipe(
    Effect.timeoutOrElse({
      duration: DEFAULT_TIMEOUT,
      orElse: () =>
        Effect.succeed({ url, finalUrl: url, status: 0, contentType: "", ok: false, text: "" } as FetchText),
    }),
    Effect.catch(() =>
      Effect.succeed({ url, finalUrl: url, status: 0, contentType: "", ok: false, text: "" } as FetchText),
    ),
  )

export const normalizeDoi = (value: string) =>
  value
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .replace(/^\/+/, "")
    .trim()

export const isDoiLike = (value: string) => /^10\.\d{4,9}\/\S+$/i.test(normalizeDoi(value))
