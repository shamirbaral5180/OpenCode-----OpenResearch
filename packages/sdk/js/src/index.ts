export * from "./client.js"
export * from "./server.js"

import { createOpenResearchClient } from "./client.js"
import { createOpenResearchServer } from "./server.js"
import type { ServerOptions } from "./server.js"

export async function createOpenResearch(options?: ServerOptions) {
  const server = await createOpenResearchServer({
    ...options,
  })

  const client = createOpenResearchClient({
    baseUrl: server.url,
  })

  return {
    client,
    server,
  }
}
