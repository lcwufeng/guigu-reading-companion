import { NextResponse } from "next/server";
import { getAchievementOverview, selectAchievementTitle } from "../../../db/achievements";
import { getActiveStudent } from "../../auth-user";
import { mutationOriginError, validMutationOrigin } from "../../../lib/request-security";

export const dynamic = "force-dynamic";

export async function GET() {
  const student = await getActiveStudent();
  if (!student) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  try {
    return NextResponse.json(await getAchievementOverview(student.id), {
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "称号进度暂时没有同步好，请稍后再试" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!validMutationOrigin(request)) return mutationOriginError();
  const student = await getActiveStudent();
  if (!student) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const body = await request.json().catch(() => null) as { achievementId?: unknown } | null;
  try {
    return NextResponse.json(await selectAchievementTitle(student.id, body?.achievementId), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "称号暂时没有戴好";
    return NextResponse.json({ error: message }, {
      status: /不存在|还没有解锁/.test(message) ? 400 : 503,
    });
  }
}
