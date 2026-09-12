import { Effect, Schema } from "effect"
import { HttpClient } from "effect/unstable/http"
import * as Tool from "./tool"
import { fetchText, normalizeText, quoteMatch } from "./verification"

export const Parameters = Schema.Struct({
  url: Schema.String.annotate({ description: "Absolute http(s) URL of the source page or document" }),
  quote: Schema.String.annotate({ description: "Exact quotation to locate in the retrieved source text" }),
})

type Metadata = {
  url: string
  fetched: boolean
  matched: boolean
  kind: "exact" | "fuzzy" | "none" | "empty" | "unavailable"
  overlap: number
  status: number
}

export const VerifyQuoteTool = Tool.define<typeof Parameters, Metadata, HttpClient.HttpClient>(
  "verify_quote",
  Effect.gen(function* () {
    const http = yield* HttpClient.HttpClient

    return {
      description:
        "Verify that a quotation actually appears in a fetched source. Tries an exact match, then a conservative fuzzy match. Returns unavailable for paywalled or unreadable pages rather than guessing. Never assume a quote is real without a match.",
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context<Metadata>) =>
        Effect.gen(function* () {
          yield* ctx.ask({ permission: "verify_quote", patterns: [params.url], always: ["*"], metadata: {} })
          if (!params.url.startsWith("http://") && !params.url.startsWith("https://")) {
            const invalid: Metadata = {
              url: params.url,
              fetched: false,
              matched: false,
              kind: "unavailable",
              overlap: 0,
              status: 0,
            }
            yield* ctx.metadata({ title: `invalid url ${params.url}`, metadata: invalid })
            return {
              title: `invalid URL for quote verification: ${params.url}`,
              output: JSON.stringify(invalid, null, 2),
              metadata: invalid,
            }
          }

          const result = yield* fetchText(http, params.url)
          const text = normalizeText(result.text)
          if (!result.ok || text.length === 0) {
            const metadata: Metadata = {
              url: params.url,
              fetched: false,
              matched: false,
              kind: "unavailable",
              overlap: 0,
              status: result.status,
            }
            yield* ctx.metadata({ title: `unavailable ${params.url}`, metadata })
            return {
              title: `source unavailable for quote verification: ${params.url}`,
              output: JSON.stringify(metadata, null, 2),
              metadata,
            }
          }

          const match = quoteMatch(result.text, params.quote)
          const metadata: Metadata = {
            url: params.url,
            fetched: true,
            matched: match.matched,
            kind: match.kind,
            overlap: Number(match.overlap.toFixed(4)),
            status: result.status,
          }
          yield* ctx.metadata({ title: `${match.matched ? "matched" : "not found"} ${params.url}`, metadata })
          return {
            title: `${match.matched ? "quote matched" : "quote not found"} (${match.kind})`,
            output: JSON.stringify(metadata, null, 2),
            metadata,
          }
        }).pipe(Effect.orDie),
    }
  }),
)
