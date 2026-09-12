import { Effect, Schema } from "effect"
import { HttpClient, HttpClientRequest } from "effect/unstable/http"
import * as Tool from "./tool"
import { fetchText, isDoiLike, normalizeDoi, quoteMatch } from "./verification"

const CROSSREF = "https://api.crossref.org/works/"
const OPENALEX = "https://api.openalex.org/works/https://doi.org/"

export const Parameters = Schema.Struct({
  claimId: Schema.optional(Schema.String).annotate({ description: "Optional claim identifier this citation supports" }),
  doi: Schema.optional(Schema.String).annotate({ description: "DOI asserted by the citation, if any" }),
  url: Schema.optional(Schema.String).annotate({ description: "URL asserted by the citation, if any" }),
  quote: Schema.optional(Schema.String).annotate({ description: "Direct quotation asserted from the source, if any" }),
})

type Verdict = "verified" | "partial" | "unverified"
type Metadata = {
  claimId?: string
  doi?: { provided: string; wellFormed: boolean; found: boolean; resolved?: string; retraction?: boolean }
  url?: { provided: string; ok: boolean; status: number; dead: boolean }
  quote?: { provided: boolean; matched: boolean; kind: string; overlap: number }
  verdict: Verdict
  reasons: string[]
}

const record = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined

export const VerifyCitationTool = Tool.define<typeof Parameters, Metadata, HttpClient.HttpClient>(
  "verify_citation",
  Effect.gen(function* () {
    const http = yield* HttpClient.HttpClient

    return {
      description:
        "Verify a citation end to end: resolve its DOI, check its URL is live, and confirm any direct quotation appears in the source. Returns a single verdict (verified, partial, unverified) with reasons. Use for every consequential external claim before finalizing.",
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context<Metadata>) =>
        Effect.gen(function* () {
          const patterns = [params.doi, params.url].filter((value): value is string => Boolean(value))
          yield* ctx.ask({
            permission: "verify_citation",
            patterns: patterns.length > 0 ? patterns : ["*"],
            always: ["*"],
            metadata: {},
          })

          const reasons: string[] = []
          const metadata: Metadata = { claimId: params.claimId, verdict: "unverified", reasons }

          if (params.doi) {
            const normalized = normalizeDoi(params.doi)
            const wellFormed = isDoiLike(normalized)
            let found = false
            let resolved: string | undefined
            let retraction = false
            if (wellFormed) {
              const crossref = yield* fetchJson(http, `${CROSSREF}${encodeURIComponent(normalized)}`)
              const parsedCrossref = crossref ? parseRetraction(crossref) : undefined
              if (parsedCrossref) {
                found = true
                resolved = parsedCrossref.doi ?? normalized
                retraction = parsedCrossref.retraction
              } else {
                const openalex = yield* fetchJson(http, `${OPENALEX}${encodeURIComponent(normalized)}`)
                if (openalex && typeof openalex.id === "string") {
                  found = true
                  resolved = normalized
                  retraction = openalex.is_retracted === true
                }
              }
            }
            metadata.doi = { provided: params.doi, wellFormed, found, resolved, retraction }
            if (!wellFormed) reasons.push("DOI is malformed")
            else if (!found) reasons.push("DOI did not resolve to a known work")
            else if (retraction) reasons.push("source is marked as retracted")
          }

          const target = params.url ?? (metadata.doi?.resolved ? `https://doi.org/${metadata.doi.resolved}` : undefined)
          if (params.url && params.url.startsWith("http")) {
            const url = params.url
            const live = yield* fetchText(http, url)
            metadata.url = { provided: url, ok: live.ok, status: live.status, dead: !live.ok || live.status === 0 }
            if (metadata.url.dead) reasons.push("URL is unreachable or dead")
          }

          if (params.quote) {
            let matched = false
            let kind = "unavailable"
            let overlap = 0
            if (target) {
              const source = yield* fetchText(http, target)
              if (source.ok && source.text.length > 0) {
                const match = quoteMatch(source.text, params.quote)
                matched = match.matched
                kind = match.kind
                overlap = Number(match.overlap.toFixed(4))
              }
            }
            metadata.quote = { provided: true, matched, kind, overlap }
            if (kind === "unavailable") reasons.push("source text unavailable; quote unverifiable")
            else if (!matched) reasons.push("quotation not found in source")
          }

          metadata.verdict = verdict(metadata)
          if (metadata.verdict === "verified") reasons.push("all provided citation elements resolved")
          yield* ctx.metadata({ title: `citation ${metadata.verdict}`, metadata })
          return { title: `citation ${metadata.verdict}`, output: JSON.stringify(metadata, null, 2), metadata }
        }).pipe(Effect.orDie),
    }
  }),
)

function verdict(metadata: Metadata): Verdict {
  const checks: boolean[] = []
  if (metadata.doi) checks.push(metadata.doi.wellFormed && metadata.doi.found && metadata.doi.retraction !== true)
  if (metadata.url) checks.push(metadata.url.ok && !metadata.url.dead)
  if (metadata.quote) checks.push(metadata.quote.matched)
  if (checks.length === 0) return "unverified"
  if (checks.every(Boolean)) return "verified"
  if (checks.some(Boolean)) return "partial"
  return "unverified"
}

function fetchJson(http: HttpClient.HttpClient, url: string) {
  return http.execute(HttpClientRequest.get(url).pipe(HttpClientRequest.acceptJson)).pipe(
    Effect.flatMap((response) =>
      response.status >= 200 && response.status < 300
        ? response.json.pipe(Effect.catch(() => Effect.succeed(undefined)))
        : Effect.succeed(undefined),
    ),
    Effect.timeoutOrElse({ duration: 20_000, orElse: () => Effect.succeed(undefined) }),
    Effect.catch(() => Effect.succeed(undefined)),
    Effect.map((value) => record(value)),
  )
}

function parseRetraction(value: Record<string, unknown>) {
  const message = record(value.message)
  if (!message) return undefined
  const type = typeof message.type === "string" ? message.type : undefined
  return {
    doi: typeof message.DOI === "string" ? message.DOI : undefined,
    retraction: type === "retraction" || Boolean(message["update-to"]),
  }
}
