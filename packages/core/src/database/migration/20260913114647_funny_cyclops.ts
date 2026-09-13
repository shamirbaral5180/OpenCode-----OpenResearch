import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260913114647_funny_cyclops",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`monitor_watch\` (
          \`id\` text PRIMARY KEY,
          \`project_id\` text NOT NULL,
          \`topic\` text NOT NULL,
          \`question\` text NOT NULL,
          \`cadence\` text NOT NULL,
          \`status\` text NOT NULL,
          \`created_at\` integer NOT NULL,
          \`last_run_at\` integer,
          \`next_run_at\` integer NOT NULL,
          \`run_count\` integer DEFAULT 0 NOT NULL,
          \`last_session_id\` text,
          \`last_summary\` text,
          CONSTRAINT \`fk_monitor_watch_project_id_project_id_fk\` FOREIGN KEY (\`project_id\`) REFERENCES \`project\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`CREATE INDEX \`monitor_watch_project_idx\` ON \`monitor_watch\` (\`project_id\`);`)
      yield* tx.run(`CREATE INDEX \`monitor_watch_due_idx\` ON \`monitor_watch\` (\`status\`,\`next_run_at\`);`)
    })
  },
} satisfies DatabaseMigration.Migration
