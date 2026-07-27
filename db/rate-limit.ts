import { readyRuntimeDatabase } from "./runtime-database";

type MemoryLimit = { count: number; resetAt: number };

const fallbackLimits = new Map<string, MemoryLimit>();

async function digestKey(scope: string, identity: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${scope}:${identity}`));
  return `${scope}:${Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function consumeMemory(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  if (fallbackLimits.size > 2_000) {
    for (const [candidate, value] of fallbackLimits) {
      if (value.resetAt <= now) fallbackLimits.delete(candidate);
    }
  }
  const current = fallbackLimits.get(key);
  if (!current || current.resetAt <= now) {
    fallbackLimits.set(key, { count: 1, resetAt: now + windowMs });
    return { limited: false, retryAfterSeconds: 0 };
  }
  current.count += 1;
  return {
    limited: current.count > limit,
    retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1_000)),
  };
}

export async function consumeRateLimit(input: {
  scope: string;
  identity: string;
  limit: number;
  windowMs: number;
}) {
  const key = await digestKey(input.scope, input.identity);
  const now = Date.now();
  const database = await readyRuntimeDatabase().catch(() => null);
  if (!database) return consumeMemory(key, input.limit, input.windowMs);

  await database.run(
    `INSERT INTO app_rate_limits (limit_key, count, reset_at, updated_at)
      VALUES (?, 1, ?, ?)
      ON CONFLICT(limit_key) DO UPDATE SET
        count = CASE WHEN app_rate_limits.reset_at <= ? THEN 1 ELSE app_rate_limits.count + 1 END,
        reset_at = CASE WHEN app_rate_limits.reset_at <= ? THEN excluded.reset_at ELSE app_rate_limits.reset_at END,
        updated_at = excluded.updated_at`,
    [key, now + input.windowMs, now, now, now],
  );
  const current = await database.first<{ count: number; reset_at: number }>(
    "SELECT count, reset_at FROM app_rate_limits WHERE limit_key = ?",
    [key],
  );
  if (Math.random() < 0.01) {
    await database.run("DELETE FROM app_rate_limits WHERE reset_at <= ?", [now]).catch(() => undefined);
  }
  return {
    limited: (current?.count || 0) > input.limit,
    retryAfterSeconds: Math.max(1, Math.ceil(((current?.reset_at || now) - now) / 1_000)),
  };
}

export async function clearRateLimit(scope: string, identity: string) {
  const key = await digestKey(scope, identity);
  fallbackLimits.delete(key);
  const database = await readyRuntimeDatabase().catch(() => null);
  if (database) await database.run("DELETE FROM app_rate_limits WHERE limit_key = ?", [key]);
}
