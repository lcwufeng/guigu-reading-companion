import { NextResponse } from "next/server";
import { authenticateUser, createSession } from "../../../../db/auth";
import { loginRequestIp, recordManagedAccountLogin } from "../../../../db/account-logins";
import { clearRateLimit, consumeRateLimit } from "../../../../db/rate-limit";
import { mutationOriginError, requestIpAddress, validMutationOrigin } from "../../../../lib/request-security";
import { SESSION_COOKIE, sessionCookieOptions } from "../../../auth-user";

function attemptKey(request: Request, username: string) {
  return `${requestIpAddress(request)}:${username.toLowerCase()}`;
}

export async function POST(request: Request) {
  if (!validMutationOrigin(request)) return mutationOriginError();
  const body = await request.json().catch(() => null) as null | { username?: string; password?: string };
  const username = typeof body?.username === "string" ? body.username.trim().slice(0, 12) : "";
  const password = typeof body?.password === "string" ? body.password.slice(0, 64) : "";
  if (!username || password.length < 6) return NextResponse.json({ error: "请输入正确的账号和密码。" }, { status: 400 });
  const key = attemptKey(request, username);
  const rateLimit = await consumeRateLimit({ scope: "student-login", identity: key, limit: 8, windowMs: 10 * 60_000 });
  if (rateLimit.limited) {
    return NextResponse.json(
      { error: "尝试次数太多，请十分钟后再试。" },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }
  try {
    const user = await authenticateUser(username, password);
    if (!user) {
      return NextResponse.json({ error: "账号或密码不正确。" }, { status: 401 });
    }
    await clearRateLimit("student-login", key);
    const token = await createSession(user.id);
    await recordManagedAccountLogin("student", user.id, loginRequestIp(request));
    const response = NextResponse.json({ loggedIn: true, mustResetPassword: user.mustResetPassword });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(request));
    return response;
  } catch {
    return NextResponse.json({ error: "登录服务暂时不可用，请稍后再试。" }, { status: 503 });
  }
}
