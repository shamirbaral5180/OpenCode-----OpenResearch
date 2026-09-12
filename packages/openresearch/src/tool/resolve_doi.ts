import { Effect, Schema } from "effect"
import { HttpClient, HttpClientRequest } from "effect/unstable/http"
import * as Tool from "./tool"
import { isDoiLike, normalizeDoi } from "./verification"

const CROSSREF = "https://api.crossref.org/works/"
const OPENALEX = "https://api.openalex.org/works/https://doi.org/"

export const Parameters = Schema.Struct({
  doi: Schema.String.annotate({ description: "DOI to resolve, with or without the https://doi.org/ prefix" }),
})

type Metadata = {
  found: boolean
  doi?: string
  title?: string
  authors?: string[]
  year?: number
  container?: string
  publisher?: string
  type?: string
  url?: string
  retraction?: boolean
  source?: "crossref" | "openalex"
}

const record = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined

const str = (value: unknown) => (typeof value === "string" && value.length > 0 ? value : undefined)
const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : undefined)

export const ResolveDoiTool = Tool.define<typeof Parameters, Metadata, HttpClient.HttpClient>(
  "resolve_doi",
  Effect.gen(function* () {
    const http = yield* HttpClient.HttpClient

    return {
      description:
        "Resolve a DOI to canonical metadata (title, authors, year, venue, URL) using Crossref and OpenAlex. Returns found=false for an unknown DOI and flags retractions. Use to confirm a citation exists before trusting it.",
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context<Metadata>) =>
        Effect.gen(function* () {
          yield* ctx.ask({ permission: "resolve_doi", patterns: [params.doi], always: ["*"], metadata: {} })
          const doi = normalizeDoi(params.doi)

          if (!isDoiLike(doi)) {
            return {
              title: `Invalid DOI: ${params.doi}`,
              output: JSON.stringify({ found: false, error: "not a DOI" }, null, 2),
              metadata: { found: false },
            }
          }

          const crossref = yield* fetchJson(http, `${CROSSREF}${encodeURIComponent(doi)}`)
          const fromCrossref = crossref ? parseCrossref(crossref) : undefined
          if (fromCrossref) {
            yield* ctx.metadata({ title: `DOI ${fromCrossref.doi ?? doi}`, metadata: fromCrossref })
            return {
              title: fromCrossref.title ?? doi,
              output: JSON.stringify(fromCrossref, null, 2),
              metadata: fromCrossref,
            }
          }

          const openalex = yield* fetchJson(http, `${OPENALEX}${encodeURIComponent(doi)}`)
          const fromOpenalex = openalex ? parseOpenalex(openalex) : undefined
          if (fromOpenalex) {
            yield* ctx.metadata({ title: `DOI ${fromOpenalex.doi ?? doi}`, metadata: fromOpenalex })
            return {
              title: fromOpenalex.title ?? doi,
              output: JSON.stringify(fromOpenalex, null, 2),
              metadata: fromOpenalex,
            }
          }

          const missing: Metadata = { found: false, doi }
          yield* ctx.metadata({ title: `Unresolved DOI: ${doi}`, metadata: missing })
          return {
            title: `Unresolved DOI: ${doi}`,
            output: JSON.stringify({ found: false, doi }, null, 2),
            metadata: missing,
          }
        }).pipe(Effect.orDie),
    }
  }),
)

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

function parseCrossref(value: Record<string, unknown>): Metadata | undefined {
  const message = record(value.message)
  if (!message) return undefined
  const author = Array.isArray(message.author) ? message.author : []
  const published = record(message.published) ?? record(message["published-print"]) ?? record(message.issued)
  const parts = published && Array.isArray(published["date-parts"]) ? published["date-parts"] : undefined
  const year = Array.isArray(parts?.[0]) ? num(parts[0][0]) : undefined
  const type = str(message.type)
  return {
    found: true,
    source: "crossref",
    doi: str(message.DOI),
    title: Array.isArray(message.title) ? str(message.title[0]) : str(message.title),
    authors: author.flatMap((entry) => {
      const item = record(entry)
      if (!item) return []
      const name = [str(item.given), str(item.family)].filter(Boolean).join(" ")
      return name ? [name] : []
    }),
    year,
    container: Array.isArray(message["container-title"]) ? str(message["container-title"][0]) : undefined,
    publisher: str(message.publisher),
    type,
    url: str(message.URL),
    retraction: type === "retraction" || Boolean(message["update-to"] && record(message["update-to"])),
  }
}

function parseOpenalex(value: Record<string, unknown>): Metadata | undefined {
  if (!str(value.id)) return undefined
  const authorships = Array.isArray(value.authorships) ? value.authorships : []
  const primary = record(value.primary_location)
  const source = primary ? record(primary.source) : undefined
  return {
    found: true,
    source: "openalex",
    doi: str(value.doi)?.replace(/^https?:\/\/doi\.org\//i, ""),
    title: str(value.title),
    authors: authorships.flatMap((entry) => {
      const item = record(entry)
      const author = item ? record(item.author) : undefined
      const name = author ? str(author.display_name) : undefined
      return name ? [name] : []
    }),
    year: num(value.publication_year),
    container: source ? str(source.display_name) : undefined,
    publisher: source ? str(source.host_organization_name) : undefined,
    type: str(value.type),
    url: str(value.id),
    retraction: value.is_retracted === true,
  }
}
