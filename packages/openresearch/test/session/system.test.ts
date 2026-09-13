import { describe, expect, test } from "bun:test"
import { LayerNode } from "@openresearch-ai/core/effect/layer-node"
import { Effect, Layer } from "effect"
import type { Agent } from "../../src/agent/agent"
import { NamedError } from "@openresearch-ai/core/util/error"
import { Skill } from "../../src/skill"
import { Permission } from "../../src/permission"
import type { Provider } from "../../src/provider/provider"
import { SystemPrompt } from "../../src/session/system"
import { MCP } from "../../src/mcp"
import { Knowledge } from "@openresearch-ai/core/knowledge/knowledge"
import { testEffect } from "../lib/effect"

const skills: Skill.Info[] = [
  {
    name: "zeta-skill",
    description: "Zeta skill.",
    location: "/tmp/zeta-skill/SKILL.md",
    content: "# zeta-skill",
  },
  {
    name: "alpha-skill",
    description: "Alpha skill.",
    location: "/tmp/alpha-skill/SKILL.md",
    content: "# alpha-skill",
  },
  {
    name: "middle-skill",
    description: "Middle skill.",
    location: "/tmp/middle-skill/SKILL.md",
    content: "# middle-skill",
  },
  {
    name: "manual-skill",
    location: "/tmp/manual-skill/SKILL.md",
    content: "# manual-skill",
  },
]

const build: Agent.Info = {
  name: "build",
  mode: "primary",
  permission: Permission.fromConfig({ "*": "allow" }),
  options: {},
}

const knowledgeContext: Knowledge.Context = {
  counts: { entities: 1, claims: 2, edges: 1 },
  contradictions: [
    {
      id: "knc_1" as Knowledge.ContextClaim["id"],
      statement: "Amounts conflict between pages",
      status: "contradicted",
      source_id: "S2",
    },
  ],
  claims: [
    {
      id: "knc_2" as Knowledge.ContextClaim["id"],
      statement: "Scholarship requires 3.10 GPA",
      status: "verified",
      confidence: "high",
      source_id: "S1",
    },
  ],
  entities: [{ id: "kne_1" as Knowledge.ContextEntity["id"], kind: "organization", name: "Troy University" }],
}

const it = testEffect(
  LayerNode.compile(SystemPrompt.node, [
    [
      MCP.node,
      Layer.mock(MCP.Service, {
        instructions: () =>
          Effect.succeed([
            {
              name: "guide-server",
              instructions: "Use lookup before mutate.",
              tools: [],
            },
            {
              name: "tool-server",
              instructions: "Prefer search before update.",
              tools: ["tool-server_search", "tool-server_update"],
            },
          ]),
      }),
    ],
    [
      Skill.node,
      Layer.succeed(
        Skill.Service,
        Skill.Service.of({
          get: (name) => Effect.succeed(skills.find((skill) => skill.name === name)),
          require: (name) => {
            const info = skills.find((skill) => skill.name === name)
            if (info) return Effect.succeed(info)
            return Effect.fail(new Skill.NotFoundError({ name, available: skills.map((skill) => skill.name) }))
          },
          all: () => Effect.succeed(skills),
          dirs: () => Effect.succeed([]),
          available: () => Effect.succeed(skills),
        }),
      ),
    ],
  ]),
)

const knowledgeIt = testEffect(
  LayerNode.compile(SystemPrompt.node, [
    [MCP.node, Layer.mock(MCP.Service, { instructions: () => Effect.succeed([]) })],
    [Skill.node, Layer.mock(Skill.Service, { available: () => Effect.succeed([]) })],
    [Knowledge.node, Layer.mock(Knowledge.Service, { context: () => Effect.succeed(knowledgeContext) })],
  ]),
)

describe("session.system", () => {
  test("selects the Meta prompt for Muse Spark model IDs", () => {
    for (const id of ["meta/muse-spark-preview", "muse-spark-1.1", "muse-spark-1.2"]) {
      const prompt = SystemPrompt.provider({ api: { id } } as Provider.Model)[0]
      expect(prompt).toContain("powered by Muse Spark,")
      expect(prompt).toContain("using Meta Muse Spark.")
      expect(prompt).not.toContain("{{MODEL_NAME}}")
    }
  })

  test("selects the Meta prompt for Muse Glimmer model IDs", () => {
    for (const id of ["meta/muse-glimmer", "meta/muse-glimmer-30b", "muse-glimmer-30b"]) {
      const prompt = SystemPrompt.provider({ api: { id } } as Provider.Model)[0]
      expect(prompt).toContain("powered by Muse Glimmer,")
      expect(prompt).toContain("using Meta Muse Glimmer.")
      expect(prompt).not.toContain("{{MODEL_NAME}}")
    }
  })

  test("selects the Kimi prompt for official provider model IDs", () => {
    for (const providerID of ["kimi-for-coding", "moonshotai", "moonshotai-cn"]) {
      const prompt = SystemPrompt.provider({ providerID, api: { id: "k3" } } as Provider.Model)[0]
      expect(prompt).toContain("# Prompt and Tool Use")
    }
  })

  it.effect("skills output is sorted by name and stable across calls", () =>
    Effect.gen(function* () {
      const prompt = yield* SystemPrompt.Service
      const first = yield* prompt.skills(build)
      const second = yield* prompt.skills(build)
      const output = first ?? (yield* Effect.fail(new NamedError.Unknown({ message: "missing skills output" })))

      expect(first).toBe(second)

      const alpha = output.indexOf("<name>alpha-skill</name>")
      const middle = output.indexOf("<name>middle-skill</name>")
      const zeta = output.indexOf("<name>zeta-skill</name>")

      expect(alpha).toBeGreaterThan(-1)
      expect(middle).toBeGreaterThan(alpha)
      expect(zeta).toBeGreaterThan(middle)
      expect(output).not.toContain("manual-skill")
    }),
  )

  it.effect("MCP output includes connected server instructions", () =>
    Effect.gen(function* () {
      const prompt = yield* SystemPrompt.Service
      const output = yield* prompt.mcp(build)

      expect(output).toBe(
        [
          "<mcp_instructions>",
          '  <server name="guide-server">',
          "    Use lookup before mutate.",
          "  </server>",
          '  <server name="tool-server">',
          "    Prefer search before update.",
          "  </server>",
          "</mcp_instructions>",
        ].join("\n"),
      )
    }),
  )

  it.effect("MCP output omits servers when all advertised tools are denied", () =>
    Effect.gen(function* () {
      const prompt = yield* SystemPrompt.Service
      const output = yield* prompt.mcp(build, Permission.fromConfig({ "tool-server_*": "deny" }))

      expect(output).toBe(
        [
          "<mcp_instructions>",
          '  <server name="guide-server">',
          "    Use lookup before mutate.",
          "  </server>",
          "</mcp_instructions>",
        ].join("\n"),
      )
    }),
  )
})

describe("session.system knowledge context", () => {
  knowledgeIt.instance("injects prior knowledge with contradictions first", () =>
    Effect.gen(function* () {
      const prompt = yield* SystemPrompt.Service
      const output = yield* prompt.knowledgeContext()

      expect(output).toBeDefined()
      expect(output).toContain('<knowledge_base entities="1" claims="2" edges="1">')
      expect(output).toContain("<contradictions")
      expect(output).toContain("Amounts conflict between pages")
      expect(output).toContain('status="verified" source="S1"')
      expect(output).toContain("Scholarship requires 3.10 GPA")
      expect(output).toContain('<entity kind="organization">Troy University</entity>')
      // Contradictions must appear before ordinary claims.
      expect(output!.indexOf("<contradictions")).toBeLessThan(output!.indexOf("<claims>"))
      expect(output).toContain("not as externally verified truth")
    }),
  )
})

describe("session.system knowledge relevance", () => {
  const seen: (string | undefined)[] = []
  const captureIt = testEffect(
    LayerNode.compile(SystemPrompt.node, [
      [MCP.node, Layer.mock(MCP.Service, { instructions: () => Effect.succeed([]) })],
      [Skill.node, Layer.mock(Skill.Service, { available: () => Effect.succeed([]) })],
      [
        Knowledge.node,
        Layer.mock(Knowledge.Service, {
          context: (input) => {
            seen.push(input?.query)
            return Effect.succeed(contextForQuery(input?.query))
          },
        }),
      ],
    ]),
  )

  const contextForQuery = (query?: string): Knowledge.Context => ({
    counts: { entities: 0, claims: 2, edges: 0 },
    contradictions: [],
    claims: [
      query?.toLowerCase().includes("gpa")
        ? { id: "knc_gpa" as Knowledge.ContextClaim["id"], statement: "Relevant GPA claim", status: "verified" }
        : { id: "knc_other" as Knowledge.ContextClaim["id"], statement: "Irrelevant claim", status: "verified" },
    ],
    entities: [],
  })

  captureIt.instance("passes the query through to context ranking", () =>
    Effect.gen(function* () {
      const prompt = yield* SystemPrompt.Service
      const output = yield* prompt.knowledgeContext("what GPA does the scholarship need")
      expect(seen).toContain("what GPA does the scholarship need")
      expect(output).toContain("Relevant GPA claim")
    }),
  )
})
