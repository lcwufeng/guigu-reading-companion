import { NextResponse } from "next/server";
import { getImportedBookAsset } from "../../../../db/book-assets";
import { importedBookAssetInfo } from "../../../../db/book-imports";
import { getActiveStudent } from "../../../auth-user";

export async function GET(request: Request) {
  const student = await getActiveStudent();
  if (!student) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  const search = new URL(request.url).searchParams;
  const bookId = search.get("bookId") || "";
  const assetId = search.get("id") || "";
  try {
    const info = await importedBookAssetInfo(bookId, assetId);
    if (!info) return NextResponse.json({ error: "插图不存在。" }, { status: 404 });
    const asset = await getImportedBookAsset(bookId, assetId);
    if (!asset) return NextResponse.json({ error: "插图不存在。" }, { status: 404 });
    return new Response(asset.body, { headers: { "cache-control": "private, max-age=86400", "content-type": asset.contentType, "x-content-type-options": "nosniff" } });
  } catch { return NextResponse.json({ error: "插图暂时无法读取。" }, { status: 503 }); }
}
