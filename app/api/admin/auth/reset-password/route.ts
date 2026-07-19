import { NextResponse } from "next/server";
import { recordAdminAudit, requestIp } from "../../../../../db/admin-audit";
import { createAdminSession, resetAdminPassword } from "../../../../../db/admin-auth";
import { ADMIN_SESSION_COOKIE, adminSessionCookieOptions, getAuthenticatedAdmin, validAdminMutationOrigin } from "../../../../admin-auth-user";

export async function POST(request: Request) {
  if (!validAdminMutationOrigin(request)) return NextResponse.json({ error: "请求来源无效。" }, { status: 403 });
  const admin = await getAuthenticatedAdmin();
  if (!admin) return NextResponse.json({ error: "登录已失效。" }, { status: 401 });
  const body = await request.json().catch(() => null) as null | { newPassword?: string; confirmPassword?: string };
  const password = typeof body?.newPassword === "string" ? body.newPassword : "";
  if (password.length < 10 || password.length > 128 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return NextResponse.json({ error: "新密码需要 10～128 位，并同时包含字母和数字。" }, { status: 400 });
  }
  if (password !== body?.confirmPassword) return NextResponse.json({ error: "两次输入的新密码不一致。" }, { status: 400 });
  try {
    await resetAdminPassword(admin.id, password);
    const token = await createAdminSession(admin.id);
    await recordAdminAudit({ adminId: admin.id, adminUsername: admin.displayName, action: "admin.password.reset", targetType: "admin", targetId: admin.id, summary: "管理员完成首次密码重置", ipAddress: requestIp(request) });
    const response = NextResponse.json({ reset: true });
    response.cookies.set(ADMIN_SESSION_COOKIE, token, adminSessionCookieOptions(request));
    return response;
  } catch {
    return NextResponse.json({ error: "密码没有保存，请稍后重试。" }, { status: 503 });
  }
}
