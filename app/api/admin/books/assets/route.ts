import { NextResponse } from "next/server";
import { saveImportedBookAsset } from "../../../../../db/book-assets";
import { registerImportedBookAsset } from "../../../../../db/book-imports";
import { getActiveAdmin, validAdminMutationOrigin } from "../../../../admin-auth-user";

const imagePattern = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/;

function decodeImage(value: unknown) {
  if (typeof value !== "string" || value.length > 5_500_000) throw new Error("插图文件无效或超过 4MB。");
  const match = value.match(imagePattern);
  if (!match) throw new Error("插图仅支持 JPEG、PNG 或 WebP。");
  const binary = atob(match[2]);
  if (!binary.length || binary.length > 4_000_000) throw new Error("插图文件无效或超过 4MB。");
  return { bytes: Uint8Array.from(binary, (character) => character.charCodeAt(0)), contentType: `image/${match[1]}` };
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
