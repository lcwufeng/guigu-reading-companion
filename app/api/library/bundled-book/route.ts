import { NextResponse } from "next/server";
import { getBundledBookAsset } from "../../../../lib/bundled-book-assets";
import { getActiveStudent } from "../../../auth-user";

const bookIdPattern = /^[a-z0-9-]{2,50}$/;
type CachedChapter = { id: string; title: string; pages?: unknown[] };
const chapterCache = new Map<string, CachedChapter[]>();

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const student = await getActiveStudent();
  if (!student) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const url = new URL(request.url);
  const bookId = url.searchParams.get("id") || "";
  if (!bookIdPattern.test(bookId)) return NextResponse.json({ error: "书籍编号无效" }, { status: 400 });
  try {
    const asset = await getBundledBookAsset(request, bookId);
    if (!asset) return NextResponse.json({ error: "没有找到这本书" }, { status: 404 });
    if (asset.contentType.includes("application/json") && (url.searchParams.has("manifest") || url.searchParams.has("chapter"))) {
      let chapters = chapterCache.get(bookId);
      if (!chapters) {
        const payload = JSON.parse(await new Response(asset.body).text()) as { chapters?: CachedChapter[] };
        chapters = Array.isArray(payload.chapters) ? payload.chapters : [];
        if (chapterCache.size >= 6) {
          const oldest = chapterCache.keys().next().value as string | undefined;
          if (oldest) chapterCache.delete(oldest);
        }
        chapterCache.set(bookId, chapters);
      }
      if (url.searchParams.has("manifest")) {
        return NextResponse.json({
          chapters: chapters.map((chapter) => ({
            id: String(chapter.id || ""),
            title: String(chapter.title || ""),
            pageCount: Array.isArray(chapter.pages) ? chapter.pages.length : 0,
          })),
        }, {
          headers: {
            "cache-control": "private, max-age=86400",
            "x-content-type-options": "nosniff",
          },
        });
      }
      const chapterIndex = Number(url.searchParams.get("chapter"));
      if (!Number.isInteger(chapterIndex) || chapterIndex < 0 || chapterIndex >= chapters.length) {
        return NextResponse.json({ error: "章节编号无效" }, { status: 400 });
      }
      return NextResponse.json({ chapter: chapters[chapterIndex] }, {
        headers: {
          "cache-control": "private, max-age=86400",
          "x-content-type-options": "nosniff",
        },
      });
    }
    return new Response(asset.body, {
      headers: {
        "cache-control": "private, max-age=86400",
        "content-type": asset.contentType,
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "书籍原文暂时不可用" }, { status: 503 });
  }
}
