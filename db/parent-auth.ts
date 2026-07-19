import {
  createToken,
  ensureInitialStudentAccounts,
  passwordHash,
  sha256,
  verifyPassword,
} from "./auth";
import { readyRuntimeDatabase, type RuntimeDatabase } from "./runtime-database";

export type ParentAuthUser = {
  id: string;
  username: string;
  passwordHash: string;
  mustResetPassword: boolean;
};

type ParentAccountSeed = {
  id: string;
  username: string;
  studentId: string;
};

type LocalSession = { parentId: string; expiresAt: number; createdAt: number };
type LocalParentStore = {
  users: Record<string, ParentAuthUser>;
  sessions: Record<string, LocalSession>;
  links: Array<{ parentId: string; studentId: string; relationship: string }>;
};

export const initialParentAccounts: readonly ParentAccountSeed[] = [
  { id: "parent-demo-1", username: "同学一家长", studentId: "student-demo-1" },
  { id: "parent-demo-2", username: "同学二家长", studentId: "student-demo-2" },
  { id: "parent-demo-3", username: "同学三家长", studentId: "student-demo-3" },
  { id: "parent-demo-4", username: "同学四家长", studentId: "student-demo-4" },
  { id: "parent-demo-5", username: "同学五家长", studentId: "student-demo-5" },
  { id: "parent-demo-6", username: "同学六家长", studentId: "student-demo-6" },
  { id: "parent-demo-7", username: "同学七家长", studentId: "student-demo-7" },
] as const;

const initialPassword = "123456";
const sessionLifetime = 30 * 24 * 60 * 60 * 1000;
let databaseReadyPromise: Promise<RuntimeDatabase | null> | null = null;
let localStoreQueue = Promise.resolve();

export async function ensureInitialParentAccounts(database: RuntimeDatabase) {
  await ensureInitialStudentAccounts(database);
  for (const account of initialParentAccounts) {
    const exists = await database.first("SELECT id FROM app_parent_users WHERE id = ? OR username = ?", [account.id, account.username]);
    if (!exists) {
      const now = Date.now();
      await database.run(`INSERT INTO app_parent_users
        (id, username, password_hash, must_reset_password, created_at, updated_at)
        VALUES (?, ?, ?, 1, ?, ?)`, [account.id, account.username, await passwordHash(initialPassword), now, now]);
    }
    await database.run(`INSERT OR IGNORE INTO parent_student_links (parent_id, student_id, relationship, created_at)
      VALUES (?, ?, '家长', ?)`, [account.id, account.studentId, Date.now()]);
  }
}

async function readyDatabase() {
  if (databaseReadyPromise) return databaseReadyPromise;
  databaseReadyPromise = (async () => {
    const database = await readyRuntimeDatabase();
    if (!database) return null;
    await ensureInitialParentAccounts(database);
    return database;
  })();
  return databaseReadyPromise;
}

async function withLocalStore<T>(
  update: (store: LocalParentStore) => Promise<{ result: T; changed: boolean }> | { result: T; changed: boolean },
): Promise<T> {
  const filePath = process.env.PARENT_AUTH_STORE_FILE?.trim();
  if (!filePath) throw new Error("parent auth storage unavailable");
  let releaseQueue: () => void = () => {};
  const previous = localStoreQueue;
  localStoreQueue = new Promise<void>((resolve) => { releaseQueue = resolve; });
  await previous;
  try {
    const [{ mkdir, readFile, rename, writeFile }, { dirname }] = await Promise.all([import("node:fs/promises"), import("node:path")]);
    await mkdir(dirname(filePath), { recursive: true });
    let store: LocalParentStore = { users: {}, sessions: {}, links: [] };
    try {
      const parsed = JSON.parse(await readFile(filePath, "utf8")) as Partial<LocalParentStore>;
      if (parsed && typeof parsed === "object") {
        store = { users: parsed.users || {}, sessions: parsed.sessions || {}, links: Array.isArray(parsed.links) ? parsed.links : [] };
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    let seeded = false;
    for (const account of initialParentAccounts) {
      if (!store.users[account.id] && !Object.values(store.users).some((user) => user.username === account.username)) {
        store.users[account.id] = {
          id: account.id,
          username: account.username,
          passwordHash: await passwordHash(initialPassword),
          mustResetPassword: true,
        };
        seeded = true;
      }
      if (!store.links.some((link) => link.parentId === account.id && link.studentId === account.studentId)) {
        store.links.push({ parentId: account.id, studentId: account.studentId, relationship: "家长" });
        seeded = true;
      }
    }
    const { result, changed } = await update(store);
    if (changed || seeded) {
      const temporaryPath = `${filePath}.${process.pid}.tmp`;
      await writeFile(temporaryPath, JSON.stringify(store), { encoding: "utf8", mode: 0o600 });
      await rename(temporaryPath, filePath);
    }
    return result;
  } finally {
    releaseQueue();
  }
}

export async function authenticateParent(username: string, password: string): Promise<ParentAuthUser | null> {
  const database = await readyDatabase();
  if (database) {
    const row = await database.first<{ id: string; username: string; password_hash: string; must_reset_password: number }>(
      `SELECT id, username, password_hash, must_reset_password FROM app_parent_users WHERE username = ?`,
      [username],
    );
    if (!row || !await verifyPassword(password, row.password_hash)) return null;
    const state = await database.first<{ status: string }>("SELECT status FROM account_admin_state WHERE account_type = 'parent' AND account_id = ?", [row.id]);
    if (state?.status === "disabled") return null;
    return { id: row.id, username: row.username, passwordHash: row.password_hash, mustResetPassword: Boolean(row.must_reset_password) };
  }
  return withLocalStore(async (store) => {
    const user = Object.values(store.users).find((candidate) => candidate.username === username) || null;
    return { result: user && await verifyPassword(password, user.passwordHash) ? user : null, changed: false };
  });
}

export async function createParentSession(parentId: string) {
  const token = createToken();
  const tokenHash = await sha256(token);
  const now = Date.now();
  const expiresAt = now + sessionLifetime;
  const database = await readyDatabase();
  if (database) {
    await database.batch([
      { sql: "DELETE FROM app_parent_sessions WHERE expires_at <= ?", params: [now] },
      { sql: "INSERT INTO app_parent_sessions (token_hash, parent_id, expires_at, created_at) VALUES (?, ?, ?, ?)", params: [tokenHash, parentId, expiresAt, now] },
    ]);
  } else {
    await withLocalStore((store) => {
      Object.entries(store.sessions).forEach(([hash, session]) => { if (session.expiresAt <= now) delete store.sessions[hash]; });
      store.sessions[tokenHash] = { parentId, expiresAt, createdAt: now };
      return { result: undefined, changed: true };
    });
  }
  return token;
}

export async function getParentSessionUser(token: string): Promise<ParentAuthUser | null> {
  if (token.length < 32 || token.length > 120) return null;
  const tokenHash = await sha256(token);
  const now = Date.now();
  const database = await readyDatabase();
  if (database) {
    const row = await database.first<{ id: string; username: string; password_hash: string; must_reset_password: number }>(`SELECT u.id, u.username, u.password_hash, u.must_reset_password
      FROM app_parent_sessions s JOIN app_parent_users u ON u.id = s.parent_id
      LEFT JOIN account_admin_state a ON a.account_type = 'parent' AND a.account_id = u.id
      WHERE s.token_hash = ? AND s.expires_at > ? AND COALESCE(a.status, 'active') = 'active'`, [tokenHash, now]);
    if (!row) return null;
    return { id: row.id, username: row.username, passwordHash: row.password_hash, mustResetPassword: Boolean(row.must_reset_password) };
  }
  return withLocalStore((store) => {
    const session = store.sessions[tokenHash];
    if (!session || session.expiresAt <= now) {
      if (session) delete store.sessions[tokenHash];
      return { result: null, changed: Boolean(session) };
    }
    return { result: store.users[session.parentId] || null, changed: false };
  });
}

export async function deleteParentSession(token: string) {
  if (!token) return;
  const tokenHash = await sha256(token);
  const database = await readyDatabase();
  if (database) await database.run("DELETE FROM app_parent_sessions WHERE token_hash = ?", [tokenHash]);
  else await withLocalStore((store) => {
    const changed = Boolean(store.sessions[tokenHash]);
    delete store.sessions[tokenHash];
    return { result: undefined, changed };
  });
}

export async function resetParentPassword(parentId: string, newPassword: string) {
  const nextHash = await passwordHash(newPassword);
  const database = await readyDatabase();
  if (database) {
    await database.batch([
      { sql: "UPDATE app_parent_users SET password_hash = ?, must_reset_password = 0, updated_at = ? WHERE id = ?", params: [nextHash, Date.now(), parentId] },
      { sql: "DELETE FROM app_parent_sessions WHERE parent_id = ?", params: [parentId] },
    ]);
  } else {
    await withLocalStore((store) => {
      const user = store.users[parentId];
      if (!user) throw new Error("parent missing");
      user.passwordHash = nextHash;
      user.mustResetPassword = false;
      Object.entries(store.sessions).forEach(([hash, session]) => { if (session.parentId === parentId) delete store.sessions[hash]; });
      return { result: undefined, changed: true };
    });
  }
}
