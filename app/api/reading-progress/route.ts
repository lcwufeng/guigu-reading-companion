import { NextResponse } from "next/server";
import { getActiveStudent } from "../../auth-user";
import { listReadingProgress, saveReadingProgress } from "../../../db/reading-progress";
import { mutationOriginError, validMutationOrigin } from "../../../lib/request-security";

const bookPattern = /^[a-z0-9-]{2,80}$/;

export async function GET() {
  const student = await getActiveStudent();
  if (!student) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  try {
    const result = await listReadingProgress(student.id);
    const progress = Object.fromEntries(result.results.map((row) => [row.book_id, {
      chapter: row.chapter_index,
      page: row.page_index,
      completed: Boolean(row.completed),
    }]));
    return NextResponse.json({ progress });
  } catch {
    return NextResponse.json({ error: "progress unavailable" }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  if (!validMutationOrigin(request)) return mutationOriginError();
  const student = await getActiveStudent();
  if (!student) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const body = await request.json().catch(() => null) as null | {
    bookId?: string;
    chapter?: number;
    page?: number;
    completed?: boolean;
  };
  if (!body || !bookPattern.test(body.bookId || "")) {
    return NextResponse.json({ error: "invalid progress" }, { status: 400 });
  }
  const chapter = Math.max(0, Math.min(1000, Math.floor(Number(body.chapter) || 0)));
  const page = Math.max(0, Math.min(10000, Math.floor(Number(body.page) || 0)));
  try {
    await saveReadingProgress({ userId: student.id, bookId: body.bookId!, chapter, page, completed: Boolean(body.completed) });
    return NextResponse.json({ saved: true });
  } catch {
    return NextResponse.json({ error: "progress unavailable" }, { status: 503 });
  }
}
