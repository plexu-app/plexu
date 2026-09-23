// Drizzle schema — espelha src/db/migrations/*.sql (MVP). Modelo completo em docs/schema.sql.
import {
  pgTable, uuid, text, jsonb, timestamp, integer, boolean, bigint, primaryKey, uniqueIndex, index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const id = () => uuid("id").primaryKey().defaultRandom();
const ts = (name: string) => timestamp(name, { withTimezone: true });

export const workspaces = pgTable("workspaces", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  settings: jsonb("settings").notNull().default({}),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  auth: jsonb("auth").notNull().default({}),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const workspaceMembers = pgTable("workspace_members", {
  workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  orgRole: text("org_role", { enum: ["owner", "admin", "member", "guest"] }).notNull(),
}, (t) => [primaryKey({ columns: [t.workspaceId, t.userId] })]);

export const boards = pgTable("boards", {
  id: id(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["workflow", "database"] }).notNull().default("workflow"),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  icon: text("icon"),
  titleFieldId: uuid("title_field_id"),
  settings: jsonb("settings").notNull().default({}),
  archivedAt: ts("archived_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("boards_ws_slug").on(t.workspaceId, t.slug)]);

export const phases = pgTable("phases", {
  id: id(),
  boardId: uuid("board_id").notNull().references(() => boards.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  position: integer("position").notNull(),
  color: text("color"),
  isTerminal: boolean("is_terminal").notNull().default(false),
  allowCreate: boolean("allow_create").notNull().default(false),
  assigneeExpr: text("assignee_expr"),
  sla: jsonb("sla"),
  settings: jsonb("settings").notNull().default({}),
  archivedAt: ts("archived_at"),
});

export type FieldType =
  | "text" | "long_text" | "number" | "currency" | "date" | "datetime" | "boolean"
  | "select" | "multi_select" | "person" | "attachment" | "cpf" | "cnpj"
  | "relation" | "lookup" | "sequence" | "rollup" | "dynamic_text";

export const fields = pgTable("fields", {
  id: id(),
  boardId: uuid("board_id").notNull().references(() => boards.id, { onDelete: "cascade" }),
  type: text("type").$type<FieldType>().notNull(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  description: text("description"),
  helpText: text("help_text"),
  requiredExpr: text("required_expr"),
  visibleExpr: text("visible_expr"),
  uniqueValue: boolean("unique_value").notNull().default(false),
  defaultValueExpr: text("default_value_expr"),
  validation: jsonb("validation"),
  config: jsonb("config").notNull().default({}),
  position: integer("position").notNull().default(0),
  archivedAt: ts("archived_at"),
}, (t) => [uniqueIndex("fields_board_slug").on(t.boardId, t.slug)]);

export const fieldPhaseSettings = pgTable("field_phase_settings", {
  fieldId: uuid("field_id").references(() => fields.id, { onDelete: "cascade" }),
  phaseId: uuid("phase_id").references(() => phases.id, { onDelete: "cascade" }),
  visible: boolean("visible"),
  editable: boolean("editable"),
  required: boolean("required"),
  position: integer("position"),
}, (t) => [primaryKey({ columns: [t.fieldId, t.phaseId] })]);

export const cards = pgTable("cards", {
  id: id(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  boardId: uuid("board_id").notNull().references(() => boards.id, { onDelete: "cascade" }),
  phaseId: uuid("phase_id").references(() => phases.id),
  title: text("title").notNull().default(""),
  props: jsonb("props").$type<Record<string, unknown>>().notNull().default({}),
  computed: jsonb("computed").$type<Record<string, unknown>>().notNull().default({}),
  assignees: uuid("assignees").array().notNull().default([]),
  dueAt: ts("due_at"),
  status: text("status", { enum: ["open", "done", "canceled"] }).notNull().default("open"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
  phaseEnteredAt: ts("phase_entered_at"),
  deletedAt: ts("deleted_at"),
}, (t) => [index("cards_board_phase_idx").on(t.boardId, t.phaseId)]);

export const cardLinks = pgTable("card_links", {
  id: id(),
  fieldId: uuid("field_id").notNull().references(() => fields.id, { onDelete: "cascade" }),
  fromCardId: uuid("from_card_id").notNull().references(() => cards.id, { onDelete: "cascade" }),
  toCardId: uuid("to_card_id").notNull().references(() => cards.id, { onDelete: "cascade" }),
  position: integer("position").notNull().default(0),
  createdAt: ts("created_at").notNull().defaultNow(),
  // Espelha cards.deleted_at de uma das pontas (decisão 17). Ligação inativa é ignorada em tudo.
  deletedAt: ts("deleted_at"),
}, (t) => [
  uniqueIndex("card_links_uniq").on(t.fieldId, t.fromCardId, t.toCardId),
  index("card_links_to_idx").on(t.toCardId),
  index("card_links_ativos_to_idx").on(t.toCardId).where(sql`deleted_at is null`),
]);

export const sequences = pgTable("sequences", {
  fieldId: uuid("field_id").references(() => fields.id, { onDelete: "cascade" }),
  scopeKey: text("scope_key").notNull().default(""),
  lastValue: bigint("last_value", { mode: "number" }).notNull().default(0),
}, (t) => [primaryKey({ columns: [t.fieldId, t.scopeKey] })]);

export const cardComments = pgTable("card_comments", {
  id: id(),
  cardId: uuid("card_id").notNull().references(() => cards.id, { onDelete: "cascade" }),
  parentId: uuid("parent_id"),
  authorId: uuid("author_id").references(() => users.id),
  body: text("body").notNull(),
  source: text("source", { enum: ["user", "email", "automation", "system"] }).notNull().default("user"),
  createdAt: ts("created_at").notNull().defaultNow(),
  editedAt: ts("edited_at"),
  deletedAt: ts("deleted_at"),
});

export const attachments = pgTable("attachments", {
  id: id(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  cardId: uuid("card_id").references(() => cards.id, { onDelete: "cascade" }),
  fieldId: uuid("field_id").references(() => fields.id),
  commentId: uuid("comment_id").references(() => cardComments.id),
  storageKey: text("storage_key").notNull(),
  filename: text("filename").notNull(),
  mime: text("mime"),
  size: bigint("size", { mode: "number" }),
  uploadedBy: uuid("uploaded_by").references(() => users.id),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const rules = pgTable("rules", {
  id: id(),
  boardId: uuid("board_id").notNull().references(() => boards.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["can_enter", "can_leave", "can_back", "can_edit", "can_delete", "can_create"] }).notNull(),
  phaseId: uuid("phase_id").references(() => phases.id, { onDelete: "cascade" }),
  fieldId: uuid("field_id").references(() => fields.id, { onDelete: "cascade" }),
  expr: text("expr").notNull(),
  message: text("message"),
  onFail: jsonb("on_fail"),
  position: integer("position").notNull().default(0),
  enabled: boolean("enabled").notNull().default(true),
});

export const actions = pgTable("actions", {
  id: id(),
  boardId: uuid("board_id").notNull().references(() => boards.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  icon: text("icon"),
  visibleExpr: text("visible_expr"),
  formSchema: jsonb("form_schema"),
  steps: jsonb("steps").notNull(),
  runAs: text("run_as", { enum: ["user", "system"] }).notNull().default("user"),
  enabled: boolean("enabled").notNull().default(true),
  archivedAt: ts("archived_at"),
});

export const automations = pgTable("automations", {
  id: id(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  boardId: uuid("board_id").references(() => boards.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  mode: text("mode", { enum: ["simple", "flow"] }).notNull().default("simple"),
  trigger: jsonb("trigger").notNull(),
  conditionExpr: text("condition_expr"),
  steps: jsonb("steps"),
  env: text("env", { enum: ["draft", "test", "published"] }).notNull().default("draft"),
  publishedVersion: integer("published_version").notNull().default(0),
  suppressTriggers: boolean("suppress_triggers").notNull().default(false),
  enabled: boolean("enabled").notNull().default(true),
  archivedAt: ts("archived_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const automationRuns = pgTable("automation_runs", {
  id: id(),
  automationId: uuid("automation_id").notNull().references(() => automations.id, { onDelete: "cascade" }),
  cardId: uuid("card_id").references(() => cards.id, { onDelete: "set null" }),
  triggerEventId: uuid("trigger_event_id"),
  status: text("status", { enum: ["queued", "running", "success", "failed", "skipped", "dead"] }).notNull(),
  attempt: integer("attempt").notNull().default(1),
  log: jsonb("log").notNull().default([]),
  startedAt: ts("started_at"),
  finishedAt: ts("finished_at"),
});

export const events = pgTable("events", {
  id: id(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  boardId: uuid("board_id"),
  cardId: uuid("card_id"),
  type: text("type").notNull(),
  actorType: text("actor_type", { enum: ["user", "automation", "api", "system", "import", "form"] }).notNull(),
  actorId: uuid("actor_id"),
  data: jsonb("data").notNull(),
  occurredAt: ts("occurred_at").notNull().defaultNow(),
}, (t) => [index("events_card_idx").on(t.cardId, t.occurredAt)]);

export const views = pgTable("views", {
  id: id(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  boardId: uuid("board_id").references(() => boards.id, { onDelete: "cascade" }),
  type: text("type", { enum: ["kanban", "table", "calendar", "timeline", "gantt", "health", "activity", "dashboard"] }).notNull(),
  name: text("name").notNull(),
  config: jsonb("config").notNull().default({}),
  ownerId: uuid("owner_id").references(() => users.id),
  isShared: boolean("is_shared").notNull().default(true),
  position: integer("position").notNull().default(0),
});
