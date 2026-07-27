import { NextResponse } from "next/server";
import { recordAdminAudit, requestIp } from "../../../../../db/admin-audit";
import { authenticateAdmin, createAdminSession } from "../../../../../db/admin-auth";
import { clearRateLimit, consumeRateLimit } from "../../../../../db/rate-limit";
import { requestIpAddress } from "../../../../../lib/request-security";
import { ADMIN_SESSION_COOKIE, adminSessionCookieOptions, validAdminMutationOrigin } from "../../../../admin-auth-user";

export async function POST(request: Request) {
  if (!validAdminMutationOrigin(request)) return NextResponse.json({ error: "请求来源无效。" }, { status: 403 });
  const body = await request.json().catch(() => null) as null | { username?: string; password?: string };
  const username = typeof body?.username === "string" ? body.username.trim().slice(0, 30) : "";
  const password = typeof body?.password === "string" ? body.password.slice(0, 128) : "";
  if (!username || password.length < 10) return NextResponse.json({ error: "请输入正确的管理员账号和密码。" }, { status: 400 });
  const ip = requestIpAddress(request) || requestIp(request);
  const key = `${ip}:${username}`;
  const rateLimit = await consumeRateLimit({ scope: "admin-login", identity: key, limit: 6, windowMs: 15 * 60_000 });
  if (rateLimit.limited) {
    return NextResponse.json(
      { error: "尝试次数太多，请十五分钟后再试。" },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }
  try {
    const admin = await authenticateAdmin(username, password);
    if (!admin) {
      return NextResponse.json({ error: "管理员账号或密码不正确。" }, { status: 401 });
    }
    await clearRateLimit("admin-login", key);
    const token = await createAdminSession(admin.id);
    await recordAdminAudit({ adminId: admin.id, adminUsername: admin.username, action: "admin.login", targetType: "admin", targetId: admin.id, summary: "管理员成功登录后台", ipAddress: ip });
    const response = NextResponse.json({ loggedIn: true, mustResetPassword: admin.mustResetPassword });
    response.cookies.set(ADMIN_SESSION_COOKIE, token, adminSessionCookieOptions(request));
    return response;
  } catch {
    return NextResponse.json({ error: "管理后台暂时不可用，请稍后再试。" }, { status: 503 });
  }
}
