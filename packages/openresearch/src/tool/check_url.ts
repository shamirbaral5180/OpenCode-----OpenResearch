import { Effect, Schema } from "effect"
import { HttpClient } from "effect/unstable/http"
import * as Tool from "./tool"
import { fetchText } from "./verification"

export const Parameters = Schema.Struct({
  url: Schema.String.annotate({ description: "Absolute http(s) URL to check" }),
})

type Metadata = {
  url: string
  status: number
  ok: boolean
  finalUrl: string
  contentType: string
  dead: boolean
}

export const CheckUrlTool = Tool.define<typeof Parameters, Metadata, HttpClient.HttpClient>(
  "check_url",
  Effect.gen(function* () {
    const http = yield* HttpClient.HttpClient

    return {
      description:
        "Check whether a URL is reachable and report its HTTP status and content type. Flags 404/410 and network failures as dead. Use to catch fabricated or broken links before citing them.",
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context<Metadata>) =>
        Effect.gen(function* () {
          yield* ctx.ask({ permission: "check_url", patterns: [params.url], always: ["*"], metadata: {} })
          if (!params.url.startsWith("http://") && !params.url.startsWith("https://")) {
            return {
              title: `Invalid URL: ${params.url}`,
              output: JSON.stringify(
                { ok: false, dead: true, error: "URL must start with http:// or https://" },
                null,
                2,
              ),
              metadata: { url: params.url, status: 0, ok: false, finalUrl: params.url, contentType: "", dead: true },
            }
          }

          const result = yield* fetchText(http, params.url)
          const dead = !result.ok || result.status === 0 || [404, 410, 451].includes(result.status)
          const metadata: Metadata = {
            url: params.url,
            status: result.status,
            ok: result.ok,
            finalUrl: result.finalUrl,
            contentType: result.contentType,
            dead,
          }
          yield* ctx.metadata({ title: `${result.status || "no response"} ${params.url}`, metadata })
          return {
            title: `${result.status || "no response"} ${params.url}`,
            output: JSON.stringify(metadata, null, 2),
            metadata,
          }
        }).pipe(Effect.orDie),
    }
  }),
)
