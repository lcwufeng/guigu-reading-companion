import { NextResponse } from "next/server";
import {
  getPublishedBookCatalog,
  getPublishedBookChapterAt,
  getPublishedBookContent,
  getPublishedBookManifest,
} from "../../../../db/book-imports";
import { getActiveStudent } from "../../../auth-user";

export async function GET(request: Request) {
  const student = await getActiveStudent();
  if (!student) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  try {
    const url = new URL(request.url);
    const bookId = url.searchParams.get("id") || "";
    if (!bookId) return NextResponse.json({ books: await getPublishedBookCatalog() });
    if (url.searchParams.has("manifest")) {
      const manifest = await getPublishedBookManifest(bookId);
      return manifest ? NextResponse.json(manifest) : NextResponse.json({ error: "这本书暂时不在书房中。" }, { status: 404 });
    }
    if (url.searchParams.has("chapter")) {
      const chapterIndex = Number(url.searchParams.get("chapter"));
      const chapter = await getPublishedBookChapterAt(bookId, chapterIndex);
      return chapter ? NextResponse.json({ chapter }) : NextResponse.json({ error: "章节编号无效。" }, { status: 400 });
    }
    const book = await getPublishedBookContent(bookId);
    return book ? NextResponse.json(book) : NextResponse.json({ error: "这本书暂时不在书房中。" }, { status: 404 });
  } catch { return NextResponse.json({ error: "书房目录暂时无法读取。" }, { status: 503 }); }
}
