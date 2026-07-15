import { getActiveStudent } from "../../../auth-user";
import { getBookAudioBytes, getBookAudioMetadata } from "../../../../lib/book-audio-store";

function requestedRange(header: string | null, size: number) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return undefined;
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2] || 0));
  const end = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= size) return undefined;
  return { start, end: Math.min(end, size - 1) };
}

export async function GET(request: Request) {
  if (!await getActiveStudent()) return new Response("请先登录", { status: 401 });
  const url = new URL(request.url);
  const bookId = url.searchParams.get("bookId") || "";
  const chapterIndex = Number(url.searchParams.get("chapter"));
  try {
    const metadata = await getBookAudioMetadata(bookId, chapterIndex);
    if (!metadata) return new Response("音频尚未生成", { status: 404 });
    const bytes = await getBookAudioBytes(metadata);
    if (!bytes) return new Response("音频尚未生成", { status: 404 });
    const range = requestedRange(request.headers.get("range"), bytes.byteLength);
    if (range === undefined) {
      return new Response(null, { status: 416, headers: { "content-range": `bytes */${bytes.byteLength}` } });
    }
    const headers = new Headers({
      "accept-ranges": "bytes",
      "cache-control": "private, max-age=86400, immutable",
      "content-type": "audio/mpeg",
    });
    if (range) {
      const body = bytes.slice(range.start, range.end + 1);
      headers.set("content-length", String(body.byteLength));
      headers.set("content-range", `bytes ${range.start}-${range.end}/${bytes.byteLength}`);
      return new Response(body, { status: 206, headers });
    }
    headers.set("content-length", String(bytes.byteLength));
    return new Response(bytes, { status: 200, headers });
  } catch {
    return new Response("朗读音频暂时不可用", { status: 503 });
  }
}
