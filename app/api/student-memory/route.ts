import { NextResponse } from "next/server";
import { getActiveStudent } from "../../auth-user";
import { rememberStudentEvent, type StudentMemoryEvent } from "../../../db/student-memory";

const allowedTypes = new Set(["reading", "learning", "activity"]);

export async function POST(request: Request) {
  const student = await getActiveStudent();
  if (!student) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const body = await request.json().catch(() => null) as null | { event?: StudentMemoryEvent };
  if (!body?.event || !allowedTypes.has(body.event.type || "")) {
    return NextResponse.json({ error: "invalid memory event" }, { status: 400 });
  }
  try {
    await rememberStudentEvent(student.id, body.event);
    return NextResponse.json({ saved: true });
  } catch {
    return NextResponse.json({ error: "memory unavailable" }, { status: 503 });
  }
}
