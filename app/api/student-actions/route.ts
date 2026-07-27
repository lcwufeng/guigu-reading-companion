import { NextResponse } from "next/server";
import {
  completeDailyTask,
  completeHideAndSeek,
  feedTurtle,
  finishBook,
  finishTravel,
  pickDailyFruit,
  startTravel,
} from "../../../db/student-actions";
import { mutationOriginError, validMutationOrigin } from "../../../lib/request-security";
import { getActiveStudent } from "../../auth-user";

export async function POST(request: Request) {
  if (!validMutationOrigin(request)) return mutationOriginError();
  const student = await getActiveStudent();
  if (!student) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  try {
    switch (body?.action) {
      case "pick-fruit":
        return NextResponse.json(await pickDailyFruit(student.id));
      case "feed":
        return NextResponse.json(await feedTurtle(student.id));
      case "daily-task":
        if (!["swim", "reading", "mistake"].includes(String(body.task))) throw new Error("每日任务类型无效");
        return NextResponse.json(await completeDailyTask(student.id, body.task as "swim" | "reading" | "mistake"));
      case "hide-and-seek":
        return NextResponse.json(await completeHideAndSeek(student.id));
      case "finish-book":
        return NextResponse.json(await finishBook({
          userId: student.id,
          bookId: body.bookId,
          title: body.title,
          answer: body.answer,
          summary: body.summary,
        }));
      case "start-travel":
        return NextResponse.json(await startTravel(student.id, body.destinationId));
      case "finish-travel":
        return NextResponse.json(await finishTravel({
          userId: student.id,
          destinationId: body.destinationId,
          destination: body.destination,
          reward: body.reward,
          photo: body.photo,
          knowledge: body.knowledge,
          knowledgeCardId: body.knowledgeCardId,
          knowledgeTitle: body.knowledgeTitle,
          knowledgeFacts: body.knowledgeFacts,
        }));
      default:
        return NextResponse.json({ error: "操作类型无效" }, { status: 400 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "操作暂时没有保存";
    const status = /无效|不足|不存在|正在|没有找到|还没有|果篮空|还需要/.test(message) ? 400 : 503;
    return NextResponse.json({ error: message }, { status });
  }
}
