import { NextResponse } from "next/server";
import { recordServiceHealthEvent } from "../../../../../db/service-health";
import { recognizeBookPage } from "../../../../../lib/book-import-ai";
import { getActiveAdmin, validAdminMutationOrigin } from "../../../../admin-auth-user";

export async function POST(request: Request) {
  if (!validAdminMutationOrigin(request)) return NextResponse.json({ error: "请求来源无效。" }, { status: 403 });
  const admin = await getActiveAdmin();
  if (!admin) return NextResponse.json({ error: "请先登录管理后台。" }, { status: 401 });
  if (admin.role !== "super_admin" && admin.role !== "operator") return NextResponse.json({ error: "当前管理员没有识别图书的权限。" }, { status: 403 });
  const body = await request.json().catch(() => null) as null | { imageData?: string; pageNumber?: number };
  const startedAt = Date.now();
  try {
    const result = await recognizeBookPage(body?.imageData || "", body?.pageNumber || 1);
    await recordServiceHealthEvent({ service: "book-import-ai", operation: "page-ocr", provider: result.model, status: "success", durationMs: Date.now() - startedAt });
    return NextResponse.json(result);
  } catch (error) {
    await recordServiceHealthEvent({ service: "book-import-ai", operation: "page-ocr", provider: "MiMo", status: "failed", durationMs: Date.now() - startedAt, detail: error instanceof Error ? error.message : "ocr failed" });
    return NextResponse.json({ error: error instanceof Error ? error.message : "扫描页识别失败。" }, { status: 503 });
  }
}
