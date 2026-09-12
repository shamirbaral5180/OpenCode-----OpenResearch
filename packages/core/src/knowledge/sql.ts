import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core"
import { Timestamps } from "../database/schema.sql"
import { ProjectTable } from "../project/sql"
import { ProjectSchema } from "../project/schema"
import { KnowledgeSchema } from "./schema"

export const KnowledgeEntityTable = sqliteTable(
  "knowledge_entity",
  {
    id: text().$type<KnowledgeSchema.EntityID>().primaryKey(),
    project_id: text()
      .$type<ProjectSchema.ID>()
      .notNull()
      .references(() => ProjectTable.id, { onDelete: "cascade" }),
    kind: text().$type<KnowledgeSchema.EntityKind>().notNull(),
    name: text().notNull(),
    normalized_name: text().notNull(),
    description: text(),
    aliases: text({ mode: "json" }).$type<string[]>().notNull(),
    external_ids: text({ mode: "json" }).$type<Record<string, string>>().notNull(),
    ...Timestamps,
  },
  (table) => [
    // Entities dedupe by kind + normalized name within a project.
    uniqueIndex("knowledge_entity_project_kind_name_idx").on(table.project_id, table.kind, table.normalized_name),
    index("knowledge_entity_project_idx").on(table.project_id),
    index("knowledge_entity_name_idx").on(table.normalized_name),
  ],
)

export const KnowledgeClaimTable = sqliteTable(
  "knowledge_claim",
  {
    id: text().$type<KnowledgeSchema.ClaimID>().primaryKey(),
    project_id: text()
      .$type<ProjectSchema.ID>()
      .notNull()
      .references(() => ProjectTable.id, { onDelete: "cascade" }),
    statement: text().notNull(),
    status: text().$type<KnowledgeSchema.ClaimStatus>().notNull(),
    confidence: text().$type<KnowledgeSchema.Confidence>(),
    as_of: integer(),
    source_id: text(),
    source_topic: text(),
    session_id: text(),
    origin_key: text(),
    ...Timestamps,
  },
  (table) => [
    index("knowledge_claim_project_idx").on(table.project_id),
    index("knowledge_claim_status_idx").on(table.project_id, table.status),
    index("knowledge_claim_source_idx").on(table.project_id, table.source_id),
    // Claim provenance is idempotent per ledger record.
    uniqueIndex("knowledge_claim_origin_idx").on(table.project_id, table.origin_key),
  ],
)

export const KnowledgeEdgeTable = sqliteTable(
  "knowledge_edge",
  {
    id: text().$type<KnowledgeSchema.EdgeID>().primaryKey(),
    project_id: text()
      .$type<ProjectSchema.ID>()
      .notNull()
      .references(() => ProjectTable.id, { onDelete: "cascade" }),
    from_id: text().notNull(),
    from_kind: text().$type<KnowledgeSchema.NodeKind>().notNull(),
    to_id: text().notNull(),
    to_kind: text().$type<KnowledgeSchema.NodeKind>().notNull(),
    relation: text().notNull(),
    ...Timestamps,
  },
  (table) => [
    uniqueIndex("knowledge_edge_unique_idx").on(table.project_id, table.from_id, table.to_id, table.relation),
    index("knowledge_edge_from_idx").on(table.project_id, table.from_id),
    index("knowledge_edge_to_idx").on(table.project_id, table.to_id),
  ],
)
