import { NextResponse } from "next/server";
import { getActiveStudent } from "../../auth-user";
import { getUserState, saveUserState } from "../../../db/user-state";

export async function GET() {
  const student = await getActiveStudent();
  if (!student) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  try {
    return NextResponse.json({ state: await getUserState(student.id) });
  } catch {
    return NextResponse.json({ error: "账户数据暂时不可用" }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  const student = await getActiveStudent();
  if (!student) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const body = await request.json().catch(() => null) as null | { state?: unknown; updatedAt?: number };
  if (!body?.state || typeof body.state !== "object" || Array.isArray(body.state)) {
    return NextResponse.json({ error: "账户数据无效" }, { status: 400 });
  }
  try {
    const now = Date.now();
    const requestedUpdatedAt = Number(body.updatedAt);
    const updatedAt = Number.isFinite(requestedUpdatedAt)
      ? Math.min(now + 5 * 60 * 1000, Math.max(1, Math.floor(requestedUpdatedAt)))
      : now;
    await saveUserState(student.id, body.state, updatedAt);
    return NextResponse.json({ saved: true });
  } catch (error) {
    const tooLarge = error instanceof Error && error.message === "user state too large";
    return NextResponse.json({ error: tooLarge ? "账户数据超过保存上限" : "账户数据暂时不可用" }, { status: tooLarge ? 413 : 503 });
  }
}
