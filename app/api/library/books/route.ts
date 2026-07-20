import { NextResponse } from "next/server";
import { getPublishedBookCatalog, getPublishedBookContent } from "../../../../db/book-imports";
import { getActiveStudent } from "../../../auth-user";

export async function GET(request: Request) {
  const student = await getActiveStudent();
  if (!student) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  try {
    const bookId = new URL(request.url).searchParams.get("id") || "";
    if (!bookId) return NextResponse.json({ books: await getPublishedBookCatalog() });
    const book = await getPublishedBookContent(bookId);
    return book ? NextResponse.json(book) : NextResponse.json({ error: "这本书暂时不在书房中。" }, { status: 404 });
  } catch { return NextResponse.json({ error: "书房目录暂时无法读取。" }, { status: 503 }); }
}
