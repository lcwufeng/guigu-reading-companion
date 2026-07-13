export type ReadingProgressRow = {
  book_id: string;
  chapter_index: number;
  page_index: number;
  completed: number;
};

type LocalProgressRow = ReadingProgressRow & { updated_at: number };
type LocalProgressStore = Record<string, Record<string, LocalProgressRow>>;

let localStoreQueue = Promise.resolve();

async function readyDatabase() {
  let database: D1Database | undefined;
  try {
    const { env } = await import("cloudflare:workers");
    database = env.DB;
  } catch {
    // A regular Node server has no Cloudflare binding; use the configured file store below.
    return null;
  }
  if (!database) return null;
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

async function withLocalStore<T>(update: (store: LocalProgressStore) => { result: T; changed: boolean }): Promise<T> {
  const filePath = process.env.READING_PROGRESS_FILE?.trim();
  if (!filePath) throw new Error("reading progress storage unavailable");

  let releaseQueue = () => undefined;
  const previous = localStoreQueue;
  localStoreQueue = new Promise<void>((resolve) => { releaseQueue = resolve; });
  await previous;

  try {
    const [{ mkdir, readFile, rename, writeFile }, { dirname }] = await Promise.all([
      import("node:fs/promises"),
      import("node:path"),
    ]);
    await mkdir(dirname(filePath), { recursive: true });
    let store: LocalProgressStore = {};
    try {
      const parsed = JSON.parse(await readFile(filePath, "utf8"));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) store = parsed as LocalProgressStore;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }

    const { result, changed } = update(store);
    if (changed) {
      const temporaryPath = `${filePath}.${process.pid}.tmp`;
      await writeFile(temporaryPath, JSON.stringify(store), { encoding: "utf8", mode: 0o600 });
      await rename(temporaryPath, filePath);
    }
    return result;
  } finally {
    releaseQueue();
  }
}

export async function listReadingProgress(deviceId: string) {
  const database = await readyDatabase();
  if (database) {
    return database.prepare("SELECT book_id, chapter_index, page_index, completed FROM reading_progress WHERE device_id = ?")
      .bind(deviceId)
      .all<ReadingProgressRow>();
  }
  return withLocalStore((store) => ({
    result: { results: Object.values(store[deviceId] || {}) },
    changed: false,
  }));
}

export async function saveReadingProgress(input: {
  deviceId: string;
  bookId: string;
  chapter: number;
  page: number;
  completed: boolean;
}) {
  const database = await readyDatabase();
  if (database) {
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
    return;
  }
  await withLocalStore((store) => {
    store[input.deviceId] ||= {};
    store[input.deviceId][input.bookId] = {
      book_id: input.bookId,
      chapter_index: input.chapter,
      page_index: input.page,
      completed: input.completed ? 1 : 0,
      updated_at: Date.now(),
    };
    return { result: undefined, changed: true };
  });
}
