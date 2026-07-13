export type ReadingProgressRow = {
  book_id: string;
  chapter_index: number;
  page_index: number;
  completed: number;
};

async function readyDatabase() {
  const { env } = await import("cloudflare:workers");
  const database = env.DB;
  if (!database) throw new Error("DB binding unavailable");
  await database.batch([
    database.prepare(`CREATE TABLE IF NOT EXISTS reading_progress (
      device_id TEXT NOT NULL,
      book_id TEXT NOT NULL,
      chapter_index INTEGER NOT NULL DEFAULT 0,
      page_index INTEGER NOT NULL DEFAULT 0,
      completed INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (device_id, book_id)
    )`),
    database.prepare("CREATE INDEX IF NOT EXISTS reading_progress_updated_idx ON reading_progress(updated_at)"),
  ]);
  return database;
}

export async function listReadingProgress(deviceId: string) {
  const database = await readyDatabase();
  return database.prepare("SELECT book_id, chapter_index, page_index, completed FROM reading_progress WHERE device_id = ?")
    .bind(deviceId)
    .all<ReadingProgressRow>();
}

export async function saveReadingProgress(input: {
  deviceId: string;
  bookId: string;
  chapter: number;
  page: number;
  completed: boolean;
}) {
  const database = await readyDatabase();
  await database.prepare(`INSERT INTO reading_progress
    (device_id, book_id, chapter_index, page_index, completed, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(device_id, book_id) DO UPDATE SET
      chapter_index = excluded.chapter_index,
      page_index = excluded.page_index,
      completed = excluded.completed,
      updated_at = excluded.updated_at`)
    .bind(input.deviceId, input.bookId, input.chapter, input.page, input.completed ? 1 : 0, Date.now())
    .run();
}
