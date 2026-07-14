import { NextResponse } from "next/server";
import { createSession, resetPassword } from "../../../../db/auth";
import { getAuthenticatedStudent, SESSION_COOKIE, sessionCookieOptions } from "../../../auth-user";

export async function POST(request: Request) {
  const student = await getAuthenticatedStudent();
  if (!student) return NextResponse.json({ error: "登录已失效，请重新登录。" }, { status: 401 });
  const body = await request.json().catch(() => null) as null | { newPassword?: string; confirmPassword?: string };
  const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";
  if (newPassword.length < 6 || newPassword.length > 64) return NextResponse.json({ error: "新密码需要设置为 6～64 位。" }, { status: 400 });
  if (newPassword === "123456") return NextResponse.json({ error: "新密码不能继续使用初始密码 123456。" }, { status: 400 });
  if (newPassword !== body?.confirmPassword) return NextResponse.json({ error: "两次输入的新密码不一致。" }, { status: 400 });
  try {
    await resetPassword(student.id, newPassword);
    const token = await createSession(student.id);
    const response = NextResponse.json({ reset: true });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(request));
    return response;
  } catch {
    return NextResponse.json({ error: "密码修改失败，请稍后再试。" }, { status: 503 });
  }
}
