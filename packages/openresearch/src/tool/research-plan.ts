import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { Question } from "../question"
import { Session } from "@/session/session"
import { SessionID } from "../session/schema"
import { ResearchPlan } from "@openresearch-ai/core/research-plan"
import { ResearchPrompt } from "@openresearch-ai/core/plugin/research"
import { InstanceState } from "@/effect/instance-state"

export const Parameters = Schema.Struct({
  question: Schema.String.annotate({ description: "The research question this plan addresses" }),
  subquestions: Schema.mutable(Schema.Array(ResearchPlan.Subquestion)).annotate({
    description: "Bounded subquestions and, optionally, which subagents will handle each",
  }),
  estimated_cost_usd: Schema.Number.annotate({
    description: "Estimated total cost in USD for the planned subagent work, including retries",
  }),
  notes: Schema.optional(Schema.String).annotate({
    description: "Optional coverage, sequencing, or risk notes for the user",
  }),
})

type Metadata = {
  approved: boolean
  estimatedCostUsd: number
  workerCount: number
}

export const ResearchPlanTool = Tool.define<typeof Parameters, Metadata, Question.Service | Session.Service>(
  "research_plan",
  Effect.gen(function* () {
    const question = yield* Question.Service
    const session = yield* Session.Service

    return {
      description:
        "Propose a multi-agent research plan and get explicit user approval before launching a broad fan-out. Use this before delegating to multiple subagents. Present the subquestions, which agents will handle each, and an honest cost estimate. The user may approve, adjust, or decline. Approval is required once the planned worker count meets the configured threshold; small delegations stay frictionless. After approval you may launch the subagents.",
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context<Metadata>) =>
        Effect.gen(function* () {
          const instance = yield* InstanceState.context
          const workerCount = params.subquestions.length
          const summary = [
            `Planned subquestions (${workerCount}):`,
            ...params.subquestions.map((item, index) => {
              const agents = item.agents?.length ? ` [${item.agents.join(", ")}]` : ""
              return `  ${index + 1}. ${item.question}${agents}`
            }),
            `Estimated cost: ~$${params.estimated_cost_usd.toFixed(2)}`,
            ...(params.notes ? [`Notes: ${params.notes}`] : []),
          ].join("\n")

          const answers = yield* question.ask({
            sessionID: ctx.sessionID,
            questions: [
              {
                question: `Approve this multi-agent research plan?\n\n${summary}`,
                header: "Research Plan",
                custom: true,
                options: [
                  {
                    label: "Approve and run",
                    description: "Launch the planned subagents within the enforced limits",
                  },
                  {
                    label: "Narrow the scope",
                    description: "Reduce the number of subquestions or agents before running",
                  },
                  {
                    label: "Don't run yet",
                    description: "Do not launch subagents; continue with a single-agent investigation",
                  },
                ],
              },
            ],
            tool: ctx.callID ? { messageID: ctx.messageID, callID: ctx.callID } : undefined,
          })

          const reply = answers[0]?.[0] ?? ""
          if (reply !== "Approve and run") {
            const metadata: Metadata = { approved: false, estimatedCostUsd: params.estimated_cost_usd, workerCount }
            yield* ctx.metadata({ title: "research plan declined", metadata })
            return {
              title: "research plan declined",
              output: [
                `The user did not approve the multi-agent plan (reply: "${reply || "dismissed"}").`,
                "Do not launch the planned subagents. Either narrow the scope and propose again, or continue as a single-agent investigation.",
              ].join("\n"),
              metadata,
            }
          }

          // Persist approval on the root research session so the task chokepoint can enforce it.
          const root = yield* rootSession(session, ctx.sessionID)
          const existing = root.metadata ?? {}
          yield* session.setMetadata({
            sessionID: root.id,
            metadata: {
              ...existing,
              [ResearchPlan.metadataKey]: {
                approved: true,
                question: params.question,
                subquestions: params.subquestions,
                estimatedCostUsd: params.estimated_cost_usd,
                approvedAt: Date.now(),
              } satisfies ResearchPlan.Approval,
            },
          })

          const metadata: Metadata = { approved: true, estimatedCostUsd: params.estimated_cost_usd, workerCount }
          yield* ctx.metadata({ title: `plan approved: ${workerCount} subquestions`, metadata })
          return {
            title: `research plan approved: ${workerCount} subquestions`,
            output: [
              `The user approved the plan (~$${params.estimated_cost_usd.toFixed(2)}, ${workerCount} subquestions).`,
              `Enforced limits: max ${ResearchPrompt.orchestration.maxConcurrentWorkers} concurrent subagents, budget ceiling $${ResearchPrompt.orchestration.defaultBudgetUsd}.`,
              "You may now launch the subagents for these subquestions. Keep fan-out within the limits and synthesize the results yourself.",
              `Workspace: ${instance.directory}`,
            ].join("\n"),
            metadata,
          }
        }).pipe(Effect.orDie),
    }
  }),
)

const rootSession = Effect.fnUntraced(function* (session: Session.Interface, start: SessionID) {
  let current = yield* session.get(start)
  while (current.parentID) current = yield* session.get(current.parentID)
  return current
})
