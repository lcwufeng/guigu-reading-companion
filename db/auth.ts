type AuthUser = {
  id: string;
  username: string;
  passwordHash: string;
  mustResetPassword: boolean;
};

type LocalSession = { userId: string; expiresAt: number; createdAt: number };
type LocalAuthStore = { users: Record<string, AuthUser>; sessions: Record<string, LocalSession> };

const initialAccounts = [
  { id: "student-demo-1", username: "同学一" },
  { id: "student-demo-2", username: "同学二" },
  { id: "student-demo-3", username: "同学三" },
] as const;
const initialPassword = "123456";
const sessionLifetime = 30 * 24 * 60 * 60 * 1000;
const passwordIterations = 210_000;
let databaseReadyPromise: Promise<D1Database | null> | null = null;
let localStoreQueue = Promise.resolve();

function toBase64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function fromBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function passwordHash(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: passwordIterations }, key, 256);
  return `pbkdf2-sha256$${passwordIterations}$${toBase64(salt)}$${toBase64(new Uint8Array(bits))}`;
}

async function verifyPassword(password: string, stored: string) {
  const [algorithm, iterationsRaw, saltRaw, hashRaw] = stored.split("$");
  if (algorithm !== "pbkdf2-sha256" || !saltRaw || !hashRaw) return false;
  const iterations = Number(iterationsRaw);
  if (!Number.isInteger(iterations) || iterations < 100_000 || iterations > 1_000_000) return false;
  const salt = fromBase64(saltRaw);
  const expected = fromBase64(hashRaw);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const actual = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, expected.length * 8));
  if (actual.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) difference |= actual[index] ^ expected[index];
  return difference === 0;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function createToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return toBase64(bytes).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function readyDatabase() {
  if (databaseReadyPromise) return databaseReadyPromise;
  databaseReadyPromise = (async () => {
    let database: D1Database | undefined;
    try {
      const { env } = await import("cloudflare:workers");
      database = env.DB;
    } catch {
      return null;
    }
    if (!database) return null;
    await database.batch([
      database.prepare(`CREATE TABLE IF NOT EXISTS app_users (
        id TEXT PRIMARY KEY NOT NULL,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        must_reset_password INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`),
      database.prepare(`CREATE TABLE IF NOT EXISTS app_sessions (
        token_hash TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      )`),
      database.prepare("CREATE INDEX IF NOT EXISTS app_sessions_user_idx ON app_sessions(user_id)"),
      database.prepare("CREATE INDEX IF NOT EXISTS app_sessions_expiry_idx ON app_sessions(expires_at)"),
    ]);
    for (const account of initialAccounts) {
      const exists = await database.prepare("SELECT id FROM app_users WHERE id = ? OR username = ?").bind(account.id, account.username).first();
      if (!exists) {
        const now = Date.now();
        await database.prepare(`INSERT INTO app_users (id, username, password_hash, must_reset_password, created_at, updated_at)
          VALUES (?, ?, ?, 1, ?, ?)`)
          .bind(account.id, account.username, await passwordHash(initialPassword), now, now)
          .run();
      }
    }
    return database;
  })();
  return databaseReadyPromise;
}

async function withLocalStore<T>(update: (store: LocalAuthStore) => Promise<{ result: T; changed: boolean }> | { result: T; changed: boolean }): Promise<T> {
  const filePath = process.env.AUTH_STORE_FILE?.trim();
  if (!filePath) throw new Error("auth storage unavailable");
  let releaseQueue = () => undefined;
  const previous = localStoreQueue;
  localStoreQueue = new Promise<void>((resolve) => { releaseQueue = resolve; });
  await previous;
  try {
    const [{ mkdir, readFile, rename, writeFile }, { dirname }] = await Promise.all([import("node:fs/promises"), import("node:path")]);
    await mkdir(dirname(filePath), { recursive: true });
    let store: LocalAuthStore = { users: {}, sessions: {} };
    try {
      const parsed = JSON.parse(await readFile(filePath, "utf8")) as Partial<LocalAuthStore>;
      if (parsed && typeof parsed === "object") store = { users: parsed.users || {}, sessions: parsed.sessions || {} };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    let seeded = false;
    for (const account of initialAccounts) {
      if (!store.users[account.id] && !Object.values(store.users).some((user) => user.username === account.username)) {
        store.users[account.id] = { id: account.id, username: account.username, passwordHash: await passwordHash(initialPassword), mustResetPassword: true };
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

export async function authenticateUser(username: string, password: string): Promise<AuthUser | null> {
  const database = await readyDatabase();
  if (database) {
    const row = await database.prepare(`SELECT id, username, password_hash, must_reset_password
      FROM app_users WHERE username = ?`)
      .bind(username)
      .first<{ id: string; username: string; password_hash: string; must_reset_password: number }>();
    if (!row || !await verifyPassword(password, row.password_hash)) return null;
    return { id: row.id, username: row.username, passwordHash: row.password_hash, mustResetPassword: Boolean(row.must_reset_password) };
  }
  return withLocalStore(async (store) => {
    const user = Object.values(store.users).find((candidate) => candidate.username === username) || null;
    return { result: user && await verifyPassword(password, user.passwordHash) ? user : null, changed: false };
  });
}

export async function createSession(userId: string) {
  const token = createToken();
  const tokenHash = await sha256(token);
  const now = Date.now();
  const expiresAt = now + sessionLifetime;
  const database = await readyDatabase();
  if (database) {
    await database.batch([
      database.prepare("DELETE FROM app_sessions WHERE expires_at <= ?").bind(now),
      database.prepare("INSERT INTO app_sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)").bind(tokenHash, userId, expiresAt, now),
    ]);
  } else {
    await withLocalStore((store) => {
      Object.entries(store.sessions).forEach(([hash, session]) => { if (session.expiresAt <= now) delete store.sessions[hash]; });
      store.sessions[tokenHash] = { userId, expiresAt, createdAt: now };
      return { result: undefined, changed: true };
    });
  }
  return token;
}

export async function getSessionUser(token: string): Promise<AuthUser | null> {
  if (token.length < 32 || token.length > 120) return null;
  const tokenHash = await sha256(token);
  const now = Date.now();
  const database = await readyDatabase();
  if (database) {
    const row = await database.prepare(`SELECT u.id, u.username, u.password_hash, u.must_reset_password
      FROM app_sessions s JOIN app_users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ?`)
      .bind(tokenHash, now)
      .first<{ id: string; username: string; password_hash: string; must_reset_password: number }>();
    if (!row) return null;
    return { id: row.id, username: row.username, passwordHash: row.password_hash, mustResetPassword: Boolean(row.must_reset_password) };
  }
  return withLocalStore((store) => {
    const session = store.sessions[tokenHash];
    if (!session || session.expiresAt <= now) {
      if (session) delete store.sessions[tokenHash];
      return { result: null, changed: Boolean(session) };
    }
    return { result: store.users[session.userId] || null, changed: false };
  });
}

export async function deleteSession(token: string) {
  if (!token) return;
  const tokenHash = await sha256(token);
  const database = await readyDatabase();
  if (database) {
    await database.prepare("DELETE FROM app_sessions WHERE token_hash = ?").bind(tokenHash).run();
  } else {
    await withLocalStore((store) => {
      const changed = Boolean(store.sessions[tokenHash]);
      delete store.sessions[tokenHash];
      return { result: undefined, changed };
    });
  }
}

export async function resetPassword(userId: string, newPassword: string) {
  const nextHash = await passwordHash(newPassword);
  const database = await readyDatabase();
  if (database) {
    await database.batch([
      database.prepare("UPDATE app_users SET password_hash = ?, must_reset_password = 0, updated_at = ? WHERE id = ?").bind(nextHash, Date.now(), userId),
      database.prepare("DELETE FROM app_sessions WHERE user_id = ?").bind(userId),
    ]);
  } else {
    await withLocalStore((store) => {
      const user = store.users[userId];
      if (!user) throw new Error("user missing");
      user.passwordHash = nextHash;
      user.mustResetPassword = false;
      Object.entries(store.sessions).forEach(([hash, session]) => { if (session.userId === userId) delete store.sessions[hash]; });
      return { result: undefined, changed: true };
    });
  }
}
