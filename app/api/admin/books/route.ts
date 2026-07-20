import { NextResponse } from "next/server";
import { recordAdminAudit, requestIp } from "../../../../db/admin-audit";
import { createImportedBook, getAdminImportedBooks, setImportedBookStatus, type ImportedBookStatus } from "../../../../db/book-imports";
import { getActiveAdmin, validAdminMutationOrigin } from "../../../admin-auth-user";

function canEdit(role: string) { return role === "super_admin" || role === "operator"; }

export async function GET() {
  const admin = await getActiveAdmin();
  if (!admin) return NextResponse.json({ error: "请先登录管理后台。" }, { status: 401 });
  try { return NextResponse.json({ books: await getAdminImportedBooks() }); }
  catch { return NextResponse.json({ error: "图书导入记录暂时无法读取。" }, { status: 503 }); }
}

export async function POST(request: Request) {
  if (!validAdminMutationOrigin(request)) return NextResponse.json({ error: "请求来源无效。" }, { status: 403 });
  const admin = await getActiveAdmin();
  if (!admin) return NextResponse.json({ error: "请先登录管理后台。" }, { status: 401 });
  if (!canEdit(admin.role)) return NextResponse.json({ error: "当前管理员没有导入图书的权限。" }, { status: 403 });
  try {
    const created = await createImportedBook(admin.id, await request.json());
    await recordAdminAudit({
      adminId: admin.id, adminUsername: admin.displayName, action: "book.import.publish", targetType: "book",
      targetId: created.id, summary: `导入并发布《${created.title}》到学生书房`, ipAddress: requestIp(request),
    });
    return NextResponse.json({ ok: true, book: created });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "图书发布失败，请重新检查。" }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  if (!validAdminMutationOrigin(request)) return NextResponse.json({ error: "请求来源无效。" }, { status: 403 });
  const admin = await getActiveAdmin();
  if (!admin) return NextResponse.json({ error: "请先登录管理后台。" }, { status: 401 });
  if (!canEdit(admin.role)) return NextResponse.json({ error: "当前管理员没有管理图书的权限。" }, { status: 403 });
  const body = await request.json().catch(() => null) as null | { bookId?: string; status?: ImportedBookStatus };
  if (!body?.bookId || (body.status !== "published" && body.status !== "hidden")) return NextResponse.json({ error: "图书状态无效。" }, { status: 400 });
  try {
    const updated = await setImportedBookStatus(body.bookId, body.status);
    await recordAdminAudit({
      adminId: admin.id, adminUsername: admin.displayName, action: body.status === "published" ? "book.publish" : "book.hide",
      targetType: "book", targetId: updated.id, summary: `${body.status === "published" ? "发布" : "从书房下架"}《${updated.title}》`, ipAddress: requestIp(request),
    });
    return NextResponse.json({ ok: true, book: updated });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "图书状态更新失败。" }, { status: 400 });
  }
}
