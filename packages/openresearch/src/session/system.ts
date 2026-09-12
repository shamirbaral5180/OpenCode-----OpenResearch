import { LayerNode } from "@openresearch-ai/core/effect/layer-node"
import { Context, Effect, Layer } from "effect"

import { InstanceState } from "@/effect/instance-state"

import PROMPT_ANTHROPIC from "./prompt/anthropic.txt"
import PROMPT_DEFAULT from "./prompt/default.txt"
import PROMPT_BEAST from "./prompt/beast.txt"
import PROMPT_GEMINI from "./prompt/gemini.txt"
import PROMPT_GPT from "./prompt/gpt.txt"
import PROMPT_ASTRA from "./prompt/gpt-astra.txt"
import PROMPT_KIMI from "./prompt/kimi.txt"
import PROMPT_META from "./prompt/meta.txt"

import PROMPT_CODEX from "./prompt/codex.txt"
import PROMPT_TRINITY from "./prompt/trinity.txt"
import type { Provider } from "@/provider/provider"
import type { Agent } from "@/agent/agent"
import { Permission } from "@/permission"
import { Skill } from "@/skill"
import { AbsolutePath } from "@openresearch-ai/core/schema"
import { Location } from "@openresearch-ai/core/location"
import { LocationServiceMap, locationServiceMapLayer } from "@openresearch-ai/core/location-services"
import { Reference } from "@openresearch-ai/core/reference"
import { Knowledge } from "@openresearch-ai/core/knowledge/knowledge"
import { MCP } from "@/mcp"
import { PermissionV1 } from "@openresearch-ai/core/v1/permission"

export function provider(model: Provider.Model) {
  if (model.api.id.includes("muse")) {
    const name = model.api.id.includes("muse-glimmer") ? "Muse Glimmer" : "Muse Spark"
    return [PROMPT_META.replaceAll("{{MODEL_NAME}}", name)]
  }
  if (model.api.id.includes("gpt-4") || model.api.id.includes("o1") || model.api.id.includes("o3"))
    return [PROMPT_BEAST]
  if (model.api.id.includes("gpt")) {
    if (model.api.id.includes("gpt-6")) return [PROMPT_ASTRA]
    if (model.api.id.includes("codex")) {
      return [PROMPT_CODEX]
    }
    return [PROMPT_GPT]
  }
  if (model.api.id.includes("gemini-")) return [PROMPT_GEMINI]
  if (model.api.id.includes("claude")) return [PROMPT_ANTHROPIC]
  if (model.api.id.toLowerCase().includes("trinity")) return [PROMPT_TRINITY]
  if (
    model.api.id.toLowerCase().includes("kimi") ||
    ["kimi-for-coding", "moonshotai", "moonshotai-cn"].includes(model.providerID)
  )
    return [PROMPT_KIMI]
  return [PROMPT_DEFAULT]
}

export interface Interface {
  readonly environment: (model: Provider.Model) => Effect.Effect<string[]>
  readonly skills: (agent: Agent.Info) => Effect.Effect<string | undefined>
  readonly mcp: (agent: Agent.Info, permission?: PermissionV1.Ruleset) => Effect.Effect<string | undefined>
  readonly knowledgeContext: () => Effect.Effect<string | undefined>
}

export class Service extends Context.Service<Service, Interface>()("@openresearch/SystemPrompt") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const skill = yield* Skill.Service
    const mcp = yield* MCP.Service
    const knowledge = yield* Knowledge.Service
    const locations = yield* LocationServiceMap.Service

    return Service.of({
      environment: Effect.fn("SystemPrompt.environment")(function* (model: Provider.Model) {
        const ctx = yield* InstanceState.context
        const references = yield* Effect.gen(function* () {
          return (yield* (yield* Reference.Service).list()).filter((reference) => reference.description !== undefined)
        }).pipe(Effect.provide(locations.get(Location.Ref.make({ directory: AbsolutePath.make(ctx.directory) }))))
        return [
          [
            `You are powered by the model named ${model.api.id}. The exact model ID is ${model.providerID}/${model.api.id}`,
            `Here is some useful information about the environment you are running in:`,
            `<env>`,
            `  Working directory: ${ctx.directory}`,
            `  Workspace root folder: ${ctx.worktree}`,
            `  Is directory a git repo: ${ctx.project.vcs === "git" ? "yes" : "no"}`,
            `  Platform: ${process.platform}`,
            `  Today's date: ${new Date().toDateString()}`,
            `</env>`,
          ].join("\n"),
          references.length === 0
            ? undefined
            : [
                "Project references provide additional directories that can be accessed when relevant.",
                "<available_references>",
                ...references
                  .toSorted((a, b) => a.name.localeCompare(b.name))
                  .flatMap((reference) => [
                    "  <reference>",
                    `    <name>${reference.name}</name>`,
                    `    <path>${reference.path}</path>`,
                    ...(reference.description === undefined
                      ? []
                      : [`    <description>${reference.description}</description>`]),
                    "  </reference>",
                  ]),
                "</available_references>",
              ].join("\n"),
        ].filter((part): part is string => part !== undefined)
      }),

      skills: Effect.fn("SystemPrompt.skills")(function* (agent: Agent.Info) {
        if (Permission.disabled(["skill"], agent.permission).has("skill")) return

        const list = yield* skill.available(agent)

        return [
          "Skills provide specialized instructions and workflows for specific tasks.",
          "Use the skill tool to load a skill when a task matches its description.",
          // the agents seem to ingest the information about skills a bit better if we present a more verbose
          // version of them here and a less verbose version in tool description, rather than vice versa.
          Skill.fmt(list, { verbose: true }),
        ].join("\n")
      }),

      mcp: Effect.fn("SystemPrompt.mcp")(function* (agent: Agent.Info, permission?: PermissionV1.Ruleset) {
        const ruleset = Permission.merge(agent.permission, permission ?? [])
        const instructions = (yield* mcp.instructions()).filter(
          (item) => item.tools.length === 0 || Permission.disabled(item.tools, ruleset).size < item.tools.length,
        )
        if (instructions.length === 0) return

        return [
          "<mcp_instructions>",
          ...instructions.flatMap((item) => [
            `  <server name="${item.name}">`,
            ...item.instructions.split("\n").map((line) => `    ${line}`),
            "  </server>",
          ]),
          "</mcp_instructions>",
        ].join("\n")
      }),

      // Surface prior project knowledge so a new session benefits from earlier runs
      // instead of starting blank. Contradictions are the most valuable signal, so
      // they are listed first and called out explicitly.
      knowledgeContext: Effect.fn("SystemPrompt.knowledgeContext")(function* () {
        const ctx = yield* InstanceState.context
        const context = yield* knowledge.context({ projectID: ctx.project.id }).pipe(
          Effect.catchCause(() => Effect.succeed(undefined)),
        )
        if (!context) return

        const total = context.counts.entities + context.counts.claims + context.counts.edges
        if (total === 0) return

        const lines: string[] = [
          "Prior research for this project is stored in the local knowledge base. Treat it as earlier findings from this project, not as externally verified truth, and re-verify before relying on it.",
          `<knowledge_base entities="${context.counts.entities}" claims="${context.counts.claims}" edges="${context.counts.edges}">`,
        ]

        if (context.contradictions.length > 0) {
          lines.push(`  <contradictions note="conflicting evidence was recorded; resolve or explain before asserting a conclusion">`)
          for (const claim of context.contradictions) {
            lines.push(`    <claim source="${claim.source_id ?? "unknown"}">${claim.statement}</claim>`)
          }
          lines.push("  </contradictions>")
        }

        if (context.claims.length > 0) {
          lines.push(`  <claims>`)
          for (const claim of context.claims) {
            const source = claim.source_id ? ` source="${claim.source_id}"` : ""
            lines.push(`    <claim status="${claim.status}"${source}>${claim.statement}</claim>`)
          }
          lines.push("  </claims>")
        }

        if (context.entities.length > 0) {
          lines.push(`  <entities>`)
          for (const entity of context.entities) {
            lines.push(`    <entity kind="${entity.kind}">${entity.name}</entity>`)
          }
          lines.push("  </entities>")
        }

        lines.push("</knowledge_base>")
        return lines.join("\n")
      }),
    })
  }),
)

const locationServiceMapNode = LayerNode.make({
  service: LocationServiceMap.Service,
  layer: locationServiceMapLayer,
  deps: [],
})

export const node = LayerNode.make({
  service: Service,
  layer: layer,
  deps: [Skill.node, MCP.node, Knowledge.node, locationServiceMapNode],
})

export * as SystemPrompt from "./system"
