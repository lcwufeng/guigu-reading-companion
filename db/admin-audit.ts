import { readyRuntimeDatabase } from "./runtime-database";

function clean(value: unknown, limit: number) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, limit) : "";
}

export async function recordAdminAudit(input: {
  adminId: string;
  adminUsername: string;
  action: string;
  targetType?: string;
  targetId?: string;
  summary: string;
  ipAddress?: string;
}) {
  const database = await readyRuntimeDatabase();
  if (!database) return;
  await database.run(`INSERT INTO admin_audit_logs
    (event_id, admin_id, admin_username, action, target_type, target_id, summary, ip_address, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    crypto.randomUUID(),
    clean(input.adminId, 80),
    clean(input.adminUsername, 40),
    clean(input.action, 60),
    clean(input.targetType, 40) || "system",
    clean(input.targetId, 100),
    clean(input.summary, 240),
    clean(input.ipAddress, 80),
    Date.now(),
  ]);
}

export function requestIp(request: Request) {
  return clean(request.headers.get("x-forwarded-for")?.split(",")[0] || "local", 80);
}
