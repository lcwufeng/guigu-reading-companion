type LocalStateRow = { state: unknown; updatedAt: number };
type LocalStateStore = Record<string, LocalStateRow>;

const MAX_STATE_BYTES = 1_800_000;
let localStoreQueue = Promise.resolve();

async function readyDatabase() {
  let database: D1Database | undefined;
  try {
    const { env } = await import("cloudflare:workers");
    database = env.DB;
  } catch {
    return null;
  }
  if (!database) return null;
  await database.prepare(`CREATE TABLE IF NOT EXISTS user_game_state (
    user_id TEXT PRIMARY KEY NOT NULL,
    state_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )`).run();
  return database;
}

async function withLocalStore<T>(update: (store: LocalStateStore) => { result: T; changed: boolean }): Promise<T> {
  const filePath = process.env.USER_STATE_FILE?.trim();
  if (!filePath) throw new Error("user state storage unavailable");
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
    let store: LocalStateStore = {};
    try {
      const parsed = JSON.parse(await readFile(filePath, "utf8"));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) store = parsed as LocalStateStore;
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

export function serializeUserState(state: unknown) {
  if (!state || typeof state !== "object" || Array.isArray(state)) throw new Error("invalid user state");
  const json = JSON.stringify(state);
  if (new TextEncoder().encode(json).byteLength > MAX_STATE_BYTES) throw new Error("user state too large");
  return json;
}

export async function getUserState(userId: string): Promise<unknown | null> {
  const database = await readyDatabase();
  if (database) {
    const row = await database.prepare("SELECT state_json FROM user_game_state WHERE user_id = ?")
      .bind(userId)
      .first<{ state_json: string }>();
    if (!row?.state_json) return null;
    try {
      return JSON.parse(row.state_json);
    } catch {
      return null;
    }
  }
  return withLocalStore((store) => ({ result: store[userId]?.state ?? null, changed: false }));
}

export async function saveUserState(userId: string, state: unknown, updatedAt: number) {
  const stateJson = serializeUserState(state);
  const safeUpdatedAt = Math.max(1, Math.floor(updatedAt));
  const database = await readyDatabase();
  if (database) {
    await database.prepare(`INSERT INTO user_game_state (user_id, state_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at
      WHERE excluded.updated_at >= user_game_state.updated_at`)
      .bind(userId, stateJson, safeUpdatedAt)
      .run();
    return;
  }
  await withLocalStore((store) => {
    if ((store[userId]?.updatedAt || 0) <= safeUpdatedAt) {
      store[userId] = { state: JSON.parse(stateJson), updatedAt: safeUpdatedAt };
      return { result: undefined, changed: true };
    }
    return { result: undefined, changed: false };
  });
}
