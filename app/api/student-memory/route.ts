import { NextResponse } from "next/server";
import { rememberStudentEvent, type StudentMemoryEvent } from "../../../db/student-memory";

const devicePattern = /^[a-zA-Z0-9-]{16,80}$/;
const allowedTypes = new Set(["reading", "learning", "activity"]);

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as null | { deviceId?: string; event?: StudentMemoryEvent };
  if (!body || !devicePattern.test(body.deviceId || "") || !body.event || !allowedTypes.has(body.event.type || "")) {
    return NextResponse.json({ error: "invalid memory event" }, { status: 400 });
  }
  try {
    await rememberStudentEvent(body.deviceId!, body.event);
    return NextResponse.json({ saved: true });
  } catch {
    return NextResponse.json({ error: "memory unavailable" }, { status: 503 });
  }
}
