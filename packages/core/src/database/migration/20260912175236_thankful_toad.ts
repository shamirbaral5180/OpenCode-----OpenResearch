import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260912175236_thankful_toad",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`knowledge_claim\` (
          \`id\` text PRIMARY KEY,
          \`project_id\` text NOT NULL,
          \`statement\` text NOT NULL,
          \`status\` text NOT NULL,
          \`confidence\` text,
          \`as_of\` integer,
          \`source_id\` text,
          \`source_topic\` text,
          \`session_id\` text,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_knowledge_claim_project_id_project_id_fk\` FOREIGN KEY (\`project_id\`) REFERENCES \`project\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`knowledge_edge\` (
          \`id\` text PRIMARY KEY,
          \`project_id\` text NOT NULL,
          \`from_id\` text NOT NULL,
          \`from_kind\` text NOT NULL,
          \`to_id\` text NOT NULL,
          \`to_kind\` text NOT NULL,
          \`relation\` text NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_knowledge_edge_project_id_project_id_fk\` FOREIGN KEY (\`project_id\`) REFERENCES \`project\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`knowledge_entity\` (
          \`id\` text PRIMARY KEY,
          \`project_id\` text NOT NULL,
          \`kind\` text NOT NULL,
          \`name\` text NOT NULL,
          \`normalized_name\` text NOT NULL,
          \`description\` text,
          \`aliases\` text NOT NULL,
          \`external_ids\` text NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_knowledge_entity_project_id_project_id_fk\` FOREIGN KEY (\`project_id\`) REFERENCES \`project\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`CREATE INDEX \`knowledge_claim_project_idx\` ON \`knowledge_claim\` (\`project_id\`);`)
      yield* tx.run(`CREATE INDEX \`knowledge_claim_status_idx\` ON \`knowledge_claim\` (\`project_id\`,\`status\`);`)
      yield* tx.run(
        `CREATE INDEX \`knowledge_claim_source_idx\` ON \`knowledge_claim\` (\`project_id\`,\`source_id\`);`,
      )
      yield* tx.run(
        `CREATE UNIQUE INDEX \`knowledge_edge_unique_idx\` ON \`knowledge_edge\` (\`project_id\`,\`from_id\`,\`to_id\`,\`relation\`);`,
      )
      yield* tx.run(`CREATE INDEX \`knowledge_edge_from_idx\` ON \`knowledge_edge\` (\`project_id\`,\`from_id\`);`)
      yield* tx.run(`CREATE INDEX \`knowledge_edge_to_idx\` ON \`knowledge_edge\` (\`project_id\`,\`to_id\`);`)
      yield* tx.run(
        `CREATE UNIQUE INDEX \`knowledge_entity_project_kind_name_idx\` ON \`knowledge_entity\` (\`project_id\`,\`kind\`,\`normalized_name\`);`,
      )
      yield* tx.run(`CREATE INDEX \`knowledge_entity_project_idx\` ON \`knowledge_entity\` (\`project_id\`);`)
      yield* tx.run(`CREATE INDEX \`knowledge_entity_name_idx\` ON \`knowledge_entity\` (\`normalized_name\`);`)
    })
  },
} satisfies DatabaseMigration.Migration
