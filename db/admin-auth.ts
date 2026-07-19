import { createToken, passwordHash, sha256, verifyPassword } from "./auth";
import { readyRuntimeDatabase } from "./runtime-database";

export type AdminRole = "super_admin" | "operator" | "content_editor" | "readonly";

export type AdminAuthUser = {
  id: string;
  username: string;
  passwordHash: string;
  role: AdminRole;
  mustResetPassword: boolean;
};

const sessionLifetime = 8 * 60 * 60 * 1000;
let seedPromise: Promise<void> | null = null;

async function databaseOrThrow() {
  const database = await readyRuntimeDatabase();
  if (!database) throw new Error("admin database unavailable");
  return database;
}

export async function ensureInitialAdminAccount() {
  if (seedPromise) return seedPromise;
  seedPromise = (async () => {
    const database = await databaseOrThrow();
    const existing = await database.first("SELECT id FROM app_admin_users LIMIT 1");
    if (existing) return;
    const password = process.env.ADMIN_INITIAL_PASSWORD?.trim();
    if (!password || password.length < 10) return;
    const username = process.env.ADMIN_INITIAL_USERNAME?.trim().slice(0, 30) || "admin";
    const now = Date.now();
    await database.run(`INSERT INTO app_admin_users
      (id, username, password_hash, role, status, must_reset_password, last_login_at, created_at, updated_at)
      VALUES ('admin-initial', ?, ?, 'super_admin', 'active', 1, 0, ?, ?)`,
    [username, await passwordHash(password), now, now]);
  })();
  return seedPromise;
}

export async function authenticateAdmin(username: string, password: string): Promise<AdminAuthUser | null> {
  await ensureInitialAdminAccount();
  const database = await databaseOrThrow();
  const row = await database.first<{
    id: string; username: string; password_hash: string; role: AdminRole; status: string; must_reset_password: number;
  }>(`SELECT id, username, password_hash, role, status, must_reset_password FROM app_admin_users WHERE username = ?`, [username]);
  if (!row || row.status !== "active" || !await verifyPassword(password, row.password_hash)) return null;
  const now = Date.now();
  await database.run("UPDATE app_admin_users SET last_login_at = ?, updated_at = ? WHERE id = ?", [now, now, row.id]);
  return { id: row.id, username: row.username, passwordHash: row.password_hash, role: row.role, mustResetPassword: Boolean(row.must_reset_password) };
}

export async function createAdminSession(adminId: string) {
  const database = await databaseOrThrow();
  const token = createToken();
  const tokenHash = await sha256(token);
  const now = Date.now();
  await database.batch([
    { sql: "DELETE FROM app_admin_sessions WHERE expires_at <= ?", params: [now] },
    { sql: "INSERT INTO app_admin_sessions (token_hash, admin_id, expires_at, created_at) VALUES (?, ?, ?, ?)", params: [tokenHash, adminId, now + sessionLifetime, now] },
  ]);
  return token;
}

export async function getAdminSessionUser(token: string): Promise<AdminAuthUser | null> {
  if (token.length < 32 || token.length > 120) return null;
  await ensureInitialAdminAccount();
  const database = await databaseOrThrow();
  const row = await database.first<{
    id: string; username: string; password_hash: string; role: AdminRole; status: string; must_reset_password: number;
  }>(`SELECT u.id, u.username, u.password_hash, u.role, u.status, u.must_reset_password
    FROM app_admin_sessions s JOIN app_admin_users u ON u.id = s.admin_id
    WHERE s.token_hash = ? AND s.expires_at > ?`, [await sha256(token), Date.now()]);
  if (!row || row.status !== "active") return null;
  return { id: row.id, username: row.username, passwordHash: row.password_hash, role: row.role, mustResetPassword: Boolean(row.must_reset_password) };
}

export async function deleteAdminSession(token: string) {
  if (!token) return;
  const database = await databaseOrThrow();
  await database.run("DELETE FROM app_admin_sessions WHERE token_hash = ?", [await sha256(token)]);
}

export async function resetAdminPassword(adminId: string, newPassword: string) {
  const database = await databaseOrThrow();
  const now = Date.now();
  await database.batch([
    { sql: "UPDATE app_admin_users SET password_hash = ?, must_reset_password = 0, updated_at = ? WHERE id = ?", params: [await passwordHash(newPassword), now, adminId] },
    { sql: "DELETE FROM app_admin_sessions WHERE admin_id = ?", params: [adminId] },
  ]);
}
