import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260912180138_curly_skrulls",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`ALTER TABLE \`knowledge_claim\` ADD \`origin_key\` text;`)
      yield* tx.run(
        `CREATE UNIQUE INDEX \`knowledge_claim_origin_idx\` ON \`knowledge_claim\` (\`project_id\`,\`origin_key\`);`,
      )
    })
  },
} satisfies DatabaseMigration.Migration
