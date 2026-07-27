import { NextResponse } from "next/server";
import { createParentSession, resetParentPassword } from "../../../../../db/parent-auth";
import { studentPasswordError } from "../../../../../lib/password-policy";
import { mutationOriginError, validMutationOrigin } from "../../../../../lib/request-security";
import { getAuthenticatedParent, PARENT_SESSION_COOKIE, parentSessionCookieOptions } from "../../../../parent-auth-user";

export async function POST(request: Request) {
  if (!validMutationOrigin(request)) return mutationOriginError();
  const parent = await getAuthenticatedParent();
  if (!parent) return NextResponse.json({ error: "登录已失效，请重新登录。" }, { status: 401 });
  const body = await request.json().catch(() => null) as null | { newPassword?: string; confirmPassword?: string };
  const password = typeof body?.newPassword === "string" ? body.newPassword : "";
  if (password === "123456") return NextResponse.json({ error: "新密码不能继续使用初始密码 123456。" }, { status: 400 });
  const passwordError = studentPasswordError(password);
  if (passwordError) return NextResponse.json({ error: passwordError }, { status: 400 });
  if (password !== body?.confirmPassword) return NextResponse.json({ error: "两次输入的新密码不一致。" }, { status: 400 });
  try {
    await resetParentPassword(parent.id, password);
    const token = await createParentSession(parent.id);
    const response = NextResponse.json({ reset: true });
    response.cookies.set(PARENT_SESSION_COOKIE, token, parentSessionCookieOptions(request));
    return response;
  } catch {
    return NextResponse.json({ error: "密码修改失败，请稍后再试。" }, { status: 503 });
  }
}
