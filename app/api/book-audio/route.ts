import { NextResponse } from "next/server";
import { getActiveStudent } from "../../auth-user";
import { getBookAudioMetadata } from "../../../lib/book-audio-store";

function parseAddress(request: Request) {
  const url = new URL(request.url);
  return {
    bookId: url.searchParams.get("bookId") || "",
    chapterIndex: Number(url.searchParams.get("chapter")),
  };
}

export async function GET(request: Request) {
  if (!await getActiveStudent()) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const { bookId, chapterIndex } = parseAddress(request);
  try {
    const metadata = await getBookAudioMetadata(bookId, chapterIndex);
    if (!metadata) {
      return NextResponse.json({
        ready: false,
        voiceLabel: "温柔女声",
        message: "本章音频正在提前生成，完成后即可播放",
      }, { status: 404, headers: { "cache-control": "no-store" } });
    }
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
    return NextResponse.json({
      ready: true,
      ...metadata,
      audioUrl: `${basePath}/api/book-audio/file?bookId=${encodeURIComponent(bookId)}&chapter=${chapterIndex}`,
    }, { headers: { "cache-control": "private, max-age=60" } });
  } catch {
    return NextResponse.json({ error: "朗读音频暂时不可用" }, { status: 503 });
  }
}
