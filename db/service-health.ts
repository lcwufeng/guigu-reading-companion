import { readyRuntimeDatabase } from "./runtime-database";

function clean(value: unknown, limit: number) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, limit) : "";
}

export async function recordServiceHealthEvent(input: {
  service: "reading-ai" | "chat-ai" | "mistake-ai" | "parent-ai" | "speech";
  operation: string;
  provider: string;
  status: "success" | "failed" | "fallback";
  durationMs: number;
  detail?: string;
}) {
  try {
    const database = await readyRuntimeDatabase();
    if (!database) return;
    const now = Date.now();
    await database.batch([
      { sql: `INSERT INTO service_health_events
        (event_id, service, operation, provider, status, duration_ms, detail, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, params: [
        crypto.randomUUID(), clean(input.service, 40), clean(input.operation, 60), clean(input.provider, 60), clean(input.status, 20),
        Math.min(120_000, Math.max(0, Math.floor(input.durationMs) || 0)), clean(input.detail, 120), now,
      ] },
      { sql: "DELETE FROM service_health_events WHERE created_at < ?", params: [now - 90 * 24 * 60 * 60 * 1000] },
    ]);
  } catch {
    // Observability must never interrupt a student or parent action.
  }
}
