import { NextResponse } from "next/server";
import { getActiveStudent } from "../../auth-user";
import { createMistakeForUser, deleteMistakeForUser } from "../../../db/mistakes";
import { deleteMistakeImage, saveMistakeImage } from "../../../db/mistake-images";
import { decodeMistakeImageData, mistakeModelSource, normalizeConfirmedMistake } from "../../../lib/mistake-ai";

const mistakeIdPattern = /^\d{10,20}$/;

function formatDate() {
  return new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric" }).format(new Date());
}

function imageIdFromUrl(value: string) {
  try {
    const id = new URL(value, "http://localhost").searchParams.get("id") || "";
    return /^[0-9a-f-]{36}$/.test(id) ? id : "";
  } catch {
    return "";
  }
}

export async function POST(request: Request) {
  const student = await getActiveStudent();
  if (!student) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const body = await request.json().catch(() => null) as null | {
    imageData?: string;
    analysis?: unknown;
  };
  let imageId = "";
  try {
    const analysis = normalizeConfirmedMistake(body?.analysis);
    if (!analysis.question || !analysis.correction) {
      return NextResponse.json({ error: "请先核对题目和正确思路" }, { status: 400 });
    }
    const { bytes, contentType } = decodeMistakeImageData(body?.imageData);
    imageId = await saveMistakeImage(student.id, bytes, contentType);
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
    const imageUrl = `${basePath}/api/mistake-image?id=${encodeURIComponent(imageId)}`;
    const record = await createMistakeForUser({
      userId: student.id,
      ...analysis,
      date: formatDate(),
      imageUrl,
      modelSource: mistakeModelSource(),
    });
    return NextResponse.json({ record });
  } catch {
    if (imageId) await deleteMistakeImage(student.id, imageId).catch(() => undefined);
    return NextResponse.json({ error: "错题保存失败，请稍后再试" }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  const student = await getActiveStudent();
  if (!student) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id") || "";
  if (!mistakeIdPattern.test(id)) return NextResponse.json({ error: "错题编号无效" }, { status: 400 });
  try {
    const images = await deleteMistakeForUser(student.id, id);
    if (!images) return NextResponse.json({ error: "错题不存在" }, { status: 404 });
    await Promise.all(images.map(imageIdFromUrl).filter(Boolean).map((imageId) => (
      deleteMistakeImage(student.id, imageId).catch(() => undefined)
    )));
    return NextResponse.json({ deleted: true });
  } catch {
    return NextResponse.json({ error: "错题删除失败" }, { status: 503 });
  }
}
