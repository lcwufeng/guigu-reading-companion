import { NextResponse } from "next/server";
import { saveImportedBookAsset } from "../../../../../db/book-assets";
import { registerImportedBookAsset } from "../../../../../db/book-imports";
import { decodeImageDataUrl } from "../../../../../lib/image-data";
import { getActiveAdmin, validAdminMutationOrigin } from "../../../../admin-auth-user";

function decodeImage(value: unknown) {
  try {
    return decodeImageDataUrl(value, {
      maxDataLength: 2_700_000,
      maxBytes: 1_900_000,
      maxPixels: 20_000_000,
    });
  } catch {
    throw new Error("仅支持 1.9MB 以内、尺寸合理的 JPG、PNG 或 WebP 插图。");
  }
}

export async function POST(request: Request) {
  if (!validAdminMutationOrigin(request)) return NextResponse.json({ error: "请求来源无效。" }, { status: 403 });
  const admin = await getActiveAdmin();
  if (!admin) return NextResponse.json({ error: "请先登录管理后台。" }, { status: 401 });
  if (admin.role !== "super_admin" && admin.role !== "operator") return NextResponse.json({ error: "当前管理员没有上传图书插图的权限。" }, { status: 403 });
  const body = await request.json().catch(() => null) as null | { bookId?: string; imageData?: string };
  try {
    const bookId = typeof body?.bookId === "string" ? body.bookId : "";
    const image = decodeImage(body?.imageData);
    const assetId = await saveImportedBookAsset(bookId, image.bytes, image.contentType);
    await registerImportedBookAsset(bookId, assetId, image.contentType, image.bytes.length);
    return NextResponse.json({ id: assetId, src: `/api/library/book-asset?bookId=${bookId}&id=${assetId}` });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "插图保存失败。" }, { status: 400 });
  }
}
