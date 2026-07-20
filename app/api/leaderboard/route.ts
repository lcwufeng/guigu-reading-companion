import { NextResponse } from "next/server";
import { getActiveStudent } from "../../auth-user";
import { getWeeklyLeaderboard } from "../../../db/leaderboard";

export async function GET() {
  const student = await getActiveStudent();
  if (!student) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  try {
    const leaderboard = await getWeeklyLeaderboard(student.id);
    if (!leaderboard) return NextResponse.json({ error: "排行榜暂时不可用" }, { status: 503 });
    return NextResponse.json(leaderboard, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "排行榜暂时不可用" }, { status: 503 });
  }
}
