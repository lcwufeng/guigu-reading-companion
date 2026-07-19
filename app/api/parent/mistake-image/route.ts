import { NextResponse } from "next/server";
import { parentCanAccessStudent } from "../../../../db/parent-center";
import { getMistakeImage } from "../../../../db/mistake-images";
import { getActiveParent } from "../../../parent-auth-user";

const idPattern = /^[0-9a-f-]{36}$/;

export async function GET(request: Request) {
  const parent = await getActiveParent();
  if (!parent) return NextResponse.json({ error: "请先登录家长中心。" }, { status: 401 });
  const url = new URL(request.url);
  const childId = (url.searchParams.get("childId") || "").slice(0, 80);
  const id = url.searchParams.get("id") || "";
  if (!childId || !idPattern.test(id)) return NextResponse.json({ error: "照片编号无效。" }, { status: 400 });
  try {
    if (!await parentCanAccessStudent(parent.id, childId)) return NextResponse.json({ error: "无权查看该照片。" }, { status: 403 });
    const image = await getMistakeImage(childId, id);
    if (!image) return NextResponse.json({ error: "照片不存在。" }, { status: 404 });
    return new Response(image.body, {
      headers: {
        "cache-control": "private, max-age=900",
        "content-type": image.contentType,
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "照片暂时不可用。" }, { status: 503 });
  }
}
