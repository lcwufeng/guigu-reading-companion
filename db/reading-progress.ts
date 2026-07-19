import { readyRuntimeDatabase } from "./runtime-database";

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
  return readyRuntimeDatabase();
}

async function withLocalStore<T>(update: (store: LocalProgressStore) => { result: T; changed: boolean }): Promise<T> {
  const filePath = process.env.READING_PROGRESS_FILE?.trim();
  if (!filePath) throw new Error("reading progress storage unavailable");

  let releaseQueue: () => void = () => {};
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

export async function listReadingProgress(userId: string) {
  const database = await readyDatabase();
  if (database) {
    return { results: await database.all<ReadingProgressRow>(
      "SELECT book_id, chapter_index, page_index, completed FROM user_reading_progress WHERE user_id = ?",
      [userId],
    ) };
  }
  return withLocalStore((store) => ({
    result: { results: Object.values(store[userId] || {}) },
    changed: false,
  }));
}

export async function saveReadingProgress(input: {
  userId: string;
  bookId: string;
  chapter: number;
  page: number;
  completed: boolean;
}) {
  const database = await readyDatabase();
  if (database) {
    const now = Date.now();
    await database.batch([{
      sql: `INSERT INTO user_reading_progress
      (user_id, book_id, chapter_index, page_index, completed, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, book_id) DO UPDATE SET
        chapter_index = excluded.chapter_index,
        page_index = excluded.page_index,
        completed = excluded.completed,
        updated_at = excluded.updated_at`,
      params: [input.userId, input.bookId, input.chapter, input.page, input.completed ? 1 : 0, now],
    }, {
      sql: `INSERT INTO user_reading_metrics (user_id, book_id, first_read_at, last_read_at, completed_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(user_id, book_id) DO UPDATE SET
          last_read_at = excluded.last_read_at,
          completed_at = CASE
            WHEN user_reading_metrics.completed_at IS NOT NULL THEN user_reading_metrics.completed_at
            ELSE excluded.completed_at
          END`,
      params: [input.userId, input.bookId, now, now, input.completed ? now : null],
    }]);
    return;
  }
  await withLocalStore((store) => {
    store[input.userId] ||= {};
    store[input.userId][input.bookId] = {
      book_id: input.bookId,
      chapter_index: input.chapter,
      page_index: input.page,
      completed: input.completed ? 1 : 0,
      updated_at: Date.now(),
    };
    return { result: undefined, changed: true };
  });
}
