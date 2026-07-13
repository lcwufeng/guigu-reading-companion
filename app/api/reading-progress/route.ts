import { NextResponse } from "next/server";
import { listReadingProgress, saveReadingProgress } from "../../../db/reading-progress";

const devicePattern = /^[a-zA-Z0-9-]{16,80}$/;
const bookPattern = /^[a-z0-9-]{2,40}$/;

export async function GET(request: Request) {
  const deviceId = new URL(request.url).searchParams.get("deviceId") || "";
  if (!devicePattern.test(deviceId)) return NextResponse.json({ error: "invalid device" }, { status: 400 });
  try {
    const result = await listReadingProgress(deviceId);
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
  const body = await request.json().catch(() => null) as null | {
    deviceId?: string;
    bookId?: string;
    chapter?: number;
    page?: number;
    completed?: boolean;
  };
  if (!body || !devicePattern.test(body.deviceId || "") || !bookPattern.test(body.bookId || "")) {
    return NextResponse.json({ error: "invalid progress" }, { status: 400 });
  }
  const chapter = Math.max(0, Math.min(1000, Math.floor(Number(body.chapter) || 0)));
  const page = Math.max(0, Math.min(10000, Math.floor(Number(body.page) || 0)));
  try {
    await saveReadingProgress({ deviceId: body.deviceId!, bookId: body.bookId!, chapter, page, completed: Boolean(body.completed) });
    return NextResponse.json({ saved: true });
  } catch {
    return NextResponse.json({ error: "progress unavailable" }, { status: 503 });
  }
}
