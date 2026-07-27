import { NextResponse } from "next/server";
import { getMiniGameLeaderboards } from "../../../db/minigame-leaderboard";
import { completeMiniGame, startMiniGame } from "../../../db/minigame-progress";
import { mutationOriginError, validMutationOrigin } from "../../../lib/request-security";
import { getActiveStudent } from "../../auth-user";

export async function GET() {
  const student = await getActiveStudent();
  if (!student) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const leaderboards = await getMiniGameLeaderboards(student.id);
  if (!leaderboards) return NextResponse.json({ error: "游戏排行榜暂时不可用" }, { status: 503 });
  return NextResponse.json({ leaderboards }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!validMutationOrigin(request)) return mutationOriginError();
  const student = await getActiveStudent();
  if (!student) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const body = await request.json().catch(() => null) as null | {
    action?: unknown;
    gameId?: unknown;
    runId?: unknown;
    score?: unknown;
    caught?: unknown;
    secondaryScore?: unknown;
  };
  try {
    if (body?.action === "start") return NextResponse.json(await startMiniGame(student.id, body.gameId));
    if (body?.action === "complete") {
      return NextResponse.json(await completeMiniGame({
        userId: student.id,
        gameId: body.gameId,
        runId: body.runId,
        score: body.score,
        caught: body.caught,
        secondaryScore: body.secondaryScore,
      }));
    }
    return NextResponse.json({ error: "小游戏操作无效" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "小游戏进度暂时不可用";
    const status = /不足|请先|不存在|无效|超时|没有找到/.test(message) ? 400 : 503;
    return NextResponse.json({ error: message }, { status });
  }
}
