import { NextResponse } from "next/server";
import { authenticateParent, createParentSession } from "../../../../../db/parent-auth";
import { recordManagedAccountLogin } from "../../../../../db/admin-center";
import { refreshParentCompanionSuggestions } from "../../../../../lib/parent-companion-refresh";
import { PARENT_SESSION_COOKIE, parentSessionCookieOptions } from "../../../../parent-auth-user";

const attempts = new Map<string, { count: number; resetAt: number }>();

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as null | { username?: string; password?: string };
  const username = typeof body?.username === "string" ? body.username.trim().slice(0, 20) : "";
  const password = typeof body?.password === "string" ? body.password.slice(0, 64) : "";
  if (!username || password.length < 6) return NextResponse.json({ error: "请输入正确的家长账号和密码。" }, { status: 400 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const key = `${ip}:${username}`;
  const now = Date.now();
  const current = attempts.get(key);
  if (current && current.resetAt > now && current.count >= 8) {
    return NextResponse.json({ error: "尝试次数太多，请十分钟后再试。" }, { status: 429 });
  }
  try {
    const parent = await authenticateParent(username, password);
    if (!parent) {
      attempts.set(key, !current || current.resetAt <= now ? { count: 1, resetAt: now + 10 * 60_000 } : { ...current, count: current.count + 1 });
      return NextResponse.json({ error: "家长账号或密码不正确。" }, { status: 401 });
    }
    attempts.delete(key);
    await recordManagedAccountLogin("parent", parent.id);
    const token = await createParentSession(parent.id);
    let suggestionRefresh: "refreshed" | "reused-today" | "retained-previous" = "retained-previous";
    try {
      const result = await refreshParentCompanionSuggestions(parent.id);
      suggestionRefresh = result.refreshed > 0 ? "refreshed" : result.reusedToday > 0 ? "reused-today" : "retained-previous";
    } catch {
      // Parent authentication must remain available even if the reporting database or AI provider is temporarily unavailable.
    }
    const response = NextResponse.json({ loggedIn: true, mustResetPassword: parent.mustResetPassword, suggestionRefresh });
    response.cookies.set(PARENT_SESSION_COOKIE, token, parentSessionCookieOptions(request));
    return response;
  } catch {
    return NextResponse.json({ error: "家长中心暂时不可用，请稍后再试。" }, { status: 503 });
  }
}
