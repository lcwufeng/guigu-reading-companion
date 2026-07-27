import { NextResponse } from "next/server";
import { authenticateParent, createParentSession } from "../../../../../db/parent-auth";
import { loginRequestIp, recordManagedAccountLogin } from "../../../../../db/account-logins";
import { clearRateLimit, consumeRateLimit } from "../../../../../db/rate-limit";
import { refreshParentCompanionSuggestions } from "../../../../../lib/parent-companion-refresh";
import { mutationOriginError, requestIpAddress, validMutationOrigin } from "../../../../../lib/request-security";
import { PARENT_SESSION_COOKIE, parentSessionCookieOptions } from "../../../../parent-auth-user";

export async function POST(request: Request) {
  if (!validMutationOrigin(request)) return mutationOriginError();
  const body = await request.json().catch(() => null) as null | { username?: string; password?: string };
  const username = typeof body?.username === "string" ? body.username.trim().slice(0, 20) : "";
  const password = typeof body?.password === "string" ? body.password.slice(0, 64) : "";
  if (!username || password.length < 6) return NextResponse.json({ error: "请输入正确的家长账号和密码。" }, { status: 400 });
  const ip = requestIpAddress(request);
  const key = `${ip}:${username}`;
  const rateLimit = await consumeRateLimit({ scope: "parent-login", identity: key, limit: 8, windowMs: 10 * 60_000 });
  if (rateLimit.limited) {
    return NextResponse.json(
      { error: "尝试次数太多，请十分钟后再试。" },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }
  try {
    const parent = await authenticateParent(username, password);
    if (!parent) {
      return NextResponse.json({ error: "家长账号或密码不正确。" }, { status: 401 });
    }
    await clearRateLimit("parent-login", key);
    const token = await createParentSession(parent.id);
    await recordManagedAccountLogin("parent", parent.id, loginRequestIp(request));
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
