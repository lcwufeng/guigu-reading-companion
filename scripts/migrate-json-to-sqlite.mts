import { chmod, copyFile, mkdir, readFile, stat } from "node:fs/promises";
import { basename, join } from "node:path";

type JsonObject = Record<string, unknown>;

function argumentsMap() {
  const result = new Map<string, string>();
  for (let index = 2; index < process.argv.length; index += 2) {
    const key = process.argv[index];
    const value = process.argv[index + 1];
    if (!key?.startsWith("--") || !value) throw new Error(`参数无效：${key || "unknown"}`);
    result.set(key.slice(2), value);
  }
  return result;
}

async function readJson(path: string, required = false): Promise<JsonObject> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`${path} 不是有效的对象数据`);
    return parsed as JsonObject;
  } catch (error) {
    if (!required && (error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

async function backupIfPresent(path: string, backupDirectory: string) {
  try {
    await stat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
  const target = join(backupDirectory, basename(path));
  await copyFile(path, target);
  await chmod(target, 0o600);
  return true;
}

function object(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function number(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
}

const args = argumentsMap();
const databasePath = args.get("database");
const authPath = args.get("auth");
const statePath = args.get("state");
const progressPath = args.get("progress");
const memoryPath = args.get("memory");
const backupRoot = args.get("backup-dir");
if (!databasePath || !authPath || !statePath || !progressPath || !memoryPath || !backupRoot) {
  throw new Error("需要 --database、--auth、--state、--progress、--memory 和 --backup-dir");
}

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupDirectory = join(backupRoot, `json-to-sqlite-${timestamp}`);
await mkdir(backupDirectory, { recursive: true, mode: 0o700 });
for (const path of [authPath, statePath, progressPath, memoryPath]) {
  await backupIfPresent(path, backupDirectory);
}
for (const path of [databasePath, `${databasePath}-wal`, `${databasePath}-shm`]) {
  await backupIfPresent(path, backupDirectory);
}

const [authStore, stateStore, progressStore, memoryStore] = await Promise.all([
  readJson(authPath, true), readJson(statePath), readJson(progressPath), readJson(memoryPath),
]);
const users = object(authStore.users);
const sessions = object(authStore.sessions);
if (!Object.keys(users).length) throw new Error("账号文件中没有可迁移用户");

const migratedUsers = Object.entries(users).map(([sourceKey, rawUser]) => {
  const user = object(rawUser);
  return { sourceKey, user, id: String(user.id || sourceKey) };
});
const sourceKeyByUserId = new Map(migratedUsers.map((user) => [user.id, user.sourceKey]));
const validUserIds = new Set(migratedUsers.map((user) => user.id));
const assignedStoreKeys = new Set(migratedUsers.flatMap((user) => [user.id, user.sourceKey]));

function userData(store: JsonObject, userId: string) {
  return store[userId] ?? store[sourceKeyByUserId.get(userId) || ""];
}

process.env.APP_DATABASE_FILE = databasePath;
const [{ readyRuntimeDatabase }, { saveUserState, getUserState }, { getStudentMemory }] = await Promise.all([
  import("../db/runtime-database"),
  import("../db/user-state"),
  import("../db/student-memory"),
]);
const database = await readyRuntimeDatabase();
if (!database || database.kind !== "sqlite") throw new Error("SQLite 数据库没有成功初始化");

const now = Date.now();
const unassignedCounts = { state: 0, progress: 0, memory: 0 };
const unassignedStatements = [];
for (const [sourceType, store] of [["state", stateStore], ["progress", progressStore], ["memory", memoryStore]] as const) {
  for (const [sourceKey, payload] of Object.entries(store)) {
    if (assignedStoreKeys.has(sourceKey)) continue;
    unassignedCounts[sourceType] += 1;
    unassignedStatements.push({
      sql: `INSERT INTO legacy_unassigned_data (source_type, source_key, payload_json, imported_at)
        VALUES (?, ?, ?, ?) ON CONFLICT(source_type, source_key) DO UPDATE SET
        payload_json = excluded.payload_json, imported_at = excluded.imported_at`,
      params: [sourceType, sourceKey, JSON.stringify(payload), now],
    });
  }
}
await database.batch(unassignedStatements);

const authStatements = [];
for (const { user, id } of migratedUsers) {
  authStatements.push({
    sql: `INSERT INTO app_users (id, username, password_hash, must_reset_password, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET username = excluded.username,
      password_hash = excluded.password_hash, must_reset_password = excluded.must_reset_password, updated_at = excluded.updated_at`,
    params: [id, String(user.username || ""), String(user.passwordHash || ""), user.mustResetPassword ? 1 : 0, now, now],
  });
}
for (const [tokenHash, rawSession] of Object.entries(sessions)) {
  const session = object(rawSession);
  const sessionUserId = String(session.userId || "");
  if (!validUserIds.has(sessionUserId)) continue;
  authStatements.push({
    sql: `INSERT INTO app_sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(token_hash) DO UPDATE SET user_id = excluded.user_id, expires_at = excluded.expires_at, created_at = excluded.created_at`,
    params: [tokenHash, sessionUserId, number(session.expiresAt), number(session.createdAt, now)],
  });
}
await database.batch(authStatements);

for (const userId of validUserIds) {
  const row = object(userData(stateStore, userId));
  if (row.state) await saveUserState(userId, row.state, number(row.updatedAt, now));
}

const progressStatements = [];
for (const userId of validUserIds) {
  const books = object(userData(progressStore, userId));
  for (const [bookId, rawProgress] of Object.entries(books)) {
    const progress = object(rawProgress);
    const updatedAt = number(progress.updated_at, now);
    const completed = progress.completed ? 1 : 0;
    progressStatements.push({
      sql: `INSERT INTO user_reading_progress (user_id, book_id, chapter_index, page_index, completed, updated_at)
        VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, book_id) DO UPDATE SET chapter_index = excluded.chapter_index,
        page_index = excluded.page_index, completed = excluded.completed, updated_at = excluded.updated_at`,
      params: [userId, bookId, number(progress.chapter_index), number(progress.page_index), completed, updatedAt],
    }, {
      sql: `INSERT INTO user_reading_metrics (user_id, book_id, first_read_at, last_read_at, completed_at)
        VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, book_id) DO UPDATE SET last_read_at = excluded.last_read_at,
        completed_at = COALESCE(user_reading_metrics.completed_at, excluded.completed_at)`,
      params: [userId, bookId, updatedAt, updatedAt, completed ? updatedAt : null],
    });
  }
}
await database.batch(progressStatements);

for (const userId of validUserIds) {
  const memory = userData(memoryStore, userId);
  if (!memory) continue;
  const safeMemory = object(memory);
  await database.run(`INSERT INTO user_student_memory (user_id, memory_json, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET memory_json = excluded.memory_json, updated_at = excluded.updated_at`, [
    userId, JSON.stringify(safeMemory), number(safeMemory.updatedAt, now),
  ]);
  await getStudentMemory(userId);
}

const perUser = [];
for (const userId of validUserIds) {
  const before = object(object(userData(stateStore, userId)).state);
  const after = object(await getUserState(userId));
  const fields = ["stars", "fruits", "tickets"] as const;
  for (const field of fields) {
    if (number(before[field]) !== number(after[field])) throw new Error(`${userId} 的 ${field} 迁移校验失败`);
  }
  perUser.push({
    userId,
    stars: number(after.stars),
    fruits: number(after.fruits),
    tickets: number(after.tickets),
    readingRecords: Array.isArray(after.readingRecords) ? after.readingRecords.length : 0,
    travelRecords: Array.isArray(after.travelRecords) ? after.travelRecords.length : 0,
    mistakes: Array.isArray(after.mistakes) ? after.mistakes.length : 0,
    progressBooks: Object.keys(object(userData(progressStore, userId))).length,
  });
}
const integrity = await database.first<{ integrity_check: string }>("PRAGMA integrity_check");
if (integrity?.integrity_check !== "ok") throw new Error("SQLite 完整性检查失败");
const migratedSessionCount = authStatements.length - migratedUsers.length;
const details = { users: perUser.length, sessions: migratedSessionCount, unassigned: unassignedCounts, perUser };
await database.run(`INSERT OR REPLACE INTO app_data_migrations
  (migration_id, completed_at, source_backup_dir, details_json) VALUES (?, ?, ?, ?)`, [
  `json-to-sqlite-${timestamp}`, Date.now(), backupDirectory, JSON.stringify(details),
]);

console.log(JSON.stringify({ databasePath, backupDirectory, integrity: "ok", ...details }, null, 2));
