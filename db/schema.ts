import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const readingProgress = sqliteTable("reading_progress", {
  deviceId: text("device_id").notNull(),
  bookId: text("book_id").notNull(),
  chapterIndex: integer("chapter_index").notNull().default(0),
  pageIndex: integer("page_index").notNull().default(0),
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [primaryKey({ columns: [table.deviceId, table.bookId] })]);

export const studentMemory = sqliteTable("student_memory", {
  deviceId: text("device_id").primaryKey(),
  memoryJson: text("memory_json").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const userGameState = sqliteTable("user_game_state", {
  userId: text("user_id").primaryKey(),
  stateJson: text("state_json").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const userReadingProgress = sqliteTable("user_reading_progress", {
  userId: text("user_id").notNull(),
  bookId: text("book_id").notNull(),
  chapterIndex: integer("chapter_index").notNull().default(0),
  pageIndex: integer("page_index").notNull().default(0),
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [primaryKey({ columns: [table.userId, table.bookId] })]);

export const userStudentMemory = sqliteTable("user_student_memory", {
  userId: text("user_id").primaryKey(),
  memoryJson: text("memory_json").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const appUsers = sqliteTable("app_users", {
  id: text("id").primaryKey(),
  username: text("username").notNull(),
  passwordHash: text("password_hash").notNull(),
  mustResetPassword: integer("must_reset_password", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [uniqueIndex("app_users_username_idx").on(table.username)]);

export const appSessions = sqliteTable("app_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id").notNull(),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  index("app_sessions_user_idx").on(table.userId),
  index("app_sessions_expiry_idx").on(table.expiresAt),
]);
