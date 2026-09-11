import type { ModelMessage, Tool } from "ai"
import { Schema } from "effect"
import type { LLMRequestPrep } from "./llm/request"

export const Snapshot = Schema.Struct({
  capturedAt: Schema.Number,
  sessionID: Schema.String,
  providerID: Schema.String,
  modelID: Schema.String,
  agent: Schema.String,
  system: Schema.Array(Schema.String),
  messages: Schema.Array(Schema.Unknown),
  tools: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      description: Schema.optional(Schema.String),
      inputSchema: Schema.Unknown,
    }),
  ),
  request: Schema.Struct({
    toolChoice: Schema.optional(Schema.Literals(["auto", "required", "none"])),
    temperature: Schema.optional(Schema.Number),
    topP: Schema.optional(Schema.Number),
    topK: Schema.optional(Schema.Number),
    maxOutputTokens: Schema.optional(Schema.Number),
    providerOptions: Schema.Unknown,
  }),
}).annotate({ identifier: "ModelInputSnapshot" })

export type Snapshot = typeof Snapshot.Type

const snapshots = new Map<string, Snapshot>()

export function record(input: {
  sessionID: string
  providerID: string
  modelID: string
  agent: string
  toolChoice?: "auto" | "required" | "none"
  prepared: LLMRequestPrep.Prepared
}) {
  const snapshot: Snapshot = {
    capturedAt: Date.now(),
    sessionID: input.sessionID,
    providerID: input.providerID,
    modelID: input.modelID,
    agent: input.agent,
    system: input.prepared.system,
    messages: jsonSafe(input.prepared.messages) as ModelMessage[],
    tools: Object.entries(input.prepared.tools).map(([name, tool]) => serializeTool(name, tool)),
    request: {
      toolChoice: input.toolChoice,
      temperature: input.prepared.params.temperature,
      topP: input.prepared.params.topP,
      topK: input.prepared.params.topK,
      maxOutputTokens: input.prepared.params.maxOutputTokens,
      providerOptions: jsonSafe(input.prepared.params.options),
    },
  }
  snapshots.set(input.sessionID, snapshot)
}

export function get(sessionID: string) {
  return snapshots.get(sessionID) ?? null
}

function serializeTool(name: string, tool: Tool) {
  return {
    name,
    description: tool.description,
    inputSchema: jsonSafe(tool.inputSchema),
  }
}

function jsonSafe(value: unknown): unknown {
  const seen = new WeakSet<object>()
  const text = JSON.stringify(value, (key, item: unknown) => {
    if (/^(authorization|proxy-authorization|api[-_]?key|password|secret|access[-_]?token|refresh[-_]?token)$/i.test(key))
      return "[redacted]"
    if (typeof item === "bigint") return item.toString()
    if (typeof item === "function") return undefined
    if (!item || typeof item !== "object") return item
    if (seen.has(item)) return "[circular]"
    seen.add(item)
    return item
  })
  return text === undefined ? null : JSON.parse(text)
}

export * as ModelInput from "./model-input"
