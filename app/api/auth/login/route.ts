import { NextResponse } from "next/server";
import { authenticateUser, createSession } from "../../../../db/auth";
import { loginRequestIp, recordManagedAccountLogin } from "../../../../db/account-logins";
import { SESSION_COOKIE, sessionCookieOptions } from "../../../auth-user";

const attempts = new Map<string, { count: number; resetAt: number }>();

function attemptKey(request: Request, username: string) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  return `${ip}:${username}`;
}

function rateLimited(key: string) {
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) return false;
  return current.count >= 8;
}

function recordFailedAttempt(key: string) {
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) attempts.set(key, { count: 1, resetAt: now + 10 * 60_000 });
  else current.count += 1;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as null | { username?: string; password?: string };
  const username = typeof body?.username === "string" ? body.username.trim().slice(0, 12) : "";
  const password = typeof body?.password === "string" ? body.password.slice(0, 64) : "";
  if (!username || password.length < 6) return NextResponse.json({ error: "请输入正确的账号和密码。" }, { status: 400 });
  const key = attemptKey(request, username);
  if (rateLimited(key)) return NextResponse.json({ error: "尝试次数太多，请十分钟后再试。" }, { status: 429 });
  try {
    const user = await authenticateUser(username, password);
    if (!user) {
      recordFailedAttempt(key);
      return NextResponse.json({ error: "账号或密码不正确。" }, { status: 401 });
    }
    attempts.delete(key);
    const token = await createSession(user.id);
    await recordManagedAccountLogin("student", user.id, loginRequestIp(request));
    const response = NextResponse.json({ loggedIn: true, mustResetPassword: user.mustResetPassword });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(request));
    return response;
  } catch {
    return NextResponse.json({ error: "登录服务暂时不可用，请稍后再试。" }, { status: 503 });
  }
}
