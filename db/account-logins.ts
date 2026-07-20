import { readyRuntimeDatabase } from "./runtime-database";

export type ManagedLoginAccountType = "student" | "parent";

export function loginRequestIp(request: Request) {
  return (request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")?.trim()
    || "").slice(0, 80);
}

export async function recordManagedAccountLogin(type: ManagedLoginAccountType, accountId: string, ipAddress = "") {
  const database = await readyRuntimeDatabase();
  if (!database) return;
  const now = Date.now();
  await database.batch([
    {
      sql: `INSERT INTO account_admin_state
        (account_type, account_id, status, last_login_at, created_by_admin_id, updated_at)
        VALUES (?, ?, 'active', ?, NULL, ?) ON CONFLICT(account_type, account_id) DO UPDATE SET
        last_login_at = excluded.last_login_at, updated_at = excluded.updated_at`,
      params: [type, accountId, now, now],
    },
    {
      sql: "INSERT INTO account_login_events (event_id, account_type, account_id, ip_address, created_at) VALUES (?, ?, ?, ?, ?)",
      params: [crypto.randomUUID(), type, accountId, ipAddress.slice(0, 80), now],
    },
    {
      sql: "DELETE FROM account_login_events WHERE created_at < ?",
      params: [now - 400 * 24 * 60 * 60 * 1000],
    },
  ]);
}
