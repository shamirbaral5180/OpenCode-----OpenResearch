import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core"
import { ProjectTable } from "../project/sql"
import { ProjectSchema } from "../project/schema"
import { MonitorSchema } from "./schema"

// Local-first watch definitions for continuous research monitoring. Stored in the
// same on-device database as the rest of the app; no server custody.
export const MonitorWatchTable = sqliteTable(
  "monitor_watch",
  {
    id: text().$type<MonitorSchema.WatchID>().primaryKey(),
    project_id: text()
      .$type<ProjectSchema.ID>()
      .notNull()
      .references(() => ProjectTable.id, { onDelete: "cascade" }),
    topic: text().notNull(),
    question: text().notNull(),
    cadence: text().$type<MonitorSchema.Cadence>().notNull(),
    status: text().$type<MonitorSchema.WatchStatus>().notNull(),
    created_at: integer().notNull(),
    last_run_at: integer(),
    next_run_at: integer().notNull(),
    run_count: integer().notNull().default(0),
    last_session_id: text(),
    last_summary: text(),
  },
  (table) => [
    index("monitor_watch_project_idx").on(table.project_id),
    index("monitor_watch_due_idx").on(table.status, table.next_run_at),
  ],
)
