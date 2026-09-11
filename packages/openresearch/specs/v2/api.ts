// @ts-nocheck

import { OpenResearch } from "@openresearch-ai/core"
import { ReadTool } from "@openresearch-ai/core/tools"

const openresearch = OpenResearch.make({})

openresearch.tool.add(ReadTool)

openresearch.tool.add({
  name: "bash",
  schema: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "The command to run.",
      },
    },
    required: ["command"],
  },
  execute(input, ctx) {},
})

openresearch.auth.add({
  provider: "openai",
  type: "api",
  value: process.env.OPENAI_API_KEY,
})

openresearch.agent.add({
  name: "build",
  permissions: [],
  model: {
    id: "gpt-5-5",
    provider: "openai",
    variant: "xhigh",
  },
})

const sessionID = await openresearch.session.create({
  agent: "build",
})

openresearch.subscribe((event) => {
  console.log(event)
})

await openresearch.session.prompt({
  sessionID,
  text: "hey what is up",
})

await openresearch.session.prompt({
  sessionID,
  text: "what is up with this",
  files: [
    {
      mime: "image/png",
      uri: "data:image/png;base64,xxxx",
    },
  ],
})

await openresearch.session.wait()

console.log(await openresearch.session.messages(sessionID))
