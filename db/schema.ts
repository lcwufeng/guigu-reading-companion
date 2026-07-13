import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
