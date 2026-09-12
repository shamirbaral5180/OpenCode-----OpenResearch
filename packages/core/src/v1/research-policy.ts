export * as ResearchPolicy from "./research-policy"

import { ResearchPrompt } from "../plugin/research"
import type { ConfigV1 } from "./config/config"

export function permissions(reportPattern = "reports/**", readonly = false): NonNullable<ConfigV1.Info["permission"]> {
  return {
    "*": "deny",
    ...ResearchPrompt.retrievalPermissions(),
    read: { "*": "allow", "*.env": "deny", "*.env.*": "deny", "*.env.example": "allow" },
    grep: "allow",
    glob: "allow",
    list: "allow",
    webfetch: "allow",
    websearch: "allow",
    question: "allow",
    external_directory: "ask",
    doom_loop: "ask",
    edit: readonly ? "deny" : { "*": "deny", [reportPattern]: "allow" },
    task: readonly ? "deny" : { "*": "deny", "research-scout": "allow", "research-reviewer": "allow" },
    todowrite: readonly ? "deny" : "allow",
  } as const
}

export function effective(config: ConfigV1.Info): ConfigV1.Info {
  return {
    ...config,
    default_agent: "research",
    instructions: [],
    skills: { paths: [], urls: [] },
    permission: permissions(),
    tools: {},
    mode: {},
    compaction: { ...ResearchPrompt.compactionSettings },
    agent: Object.fromEntries(
      ResearchPrompt.agents.map((name) => [
        name,
        {
          prompt: ResearchPrompt.prompt(name),
          steps: ResearchPrompt.steps,
          temperature: ResearchPrompt.temperature,
          top_p: ResearchPrompt.topP,
          options: {},
          permission: ResearchPrompt.isResearch(name)
            ? permissions("reports/**", name !== "research")
            : { "*": "deny" },
          mode: name === "research-scout" || name === "research-reviewer" ? "subagent" : "primary",
          hidden: !ResearchPrompt.isResearch(name),
        },
      ]),
    ),
  }
}

export function assertWritable(config: ConfigV1.Info) {
  const locked = [
    "agent",
    "mode",
    "default_agent",
    "instructions",
    "permission",
    "tools",
    "compaction",
    "skills",
  ] as const
  if (locked.some((key) => config[key] !== undefined)) {
    throw new Error(
      "Research policy is application-owned and read-only. Agent, instructions, permissions, tools and memory settings cannot be updated.",
    )
  }
}
