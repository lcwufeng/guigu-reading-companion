import { NextResponse } from "next/server";
import { getActiveStudent } from "../../auth-user";
import { deleteMistakeImage, getMistakeImage, saveMistakeImage } from "../../../db/mistake-images";

const imagePattern = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/;
const idPattern = /^[0-9a-f-]{36}$/;
const maxBytes = 2_500_000;

function decodeImageData(imageData: string) {
  const match = imageData.match(imagePattern);
  if (!match) throw new Error("invalid image");
  const binary = atob(match[2]);
  if (!binary.length || binary.length > maxBytes) throw new Error("invalid image");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return { bytes, contentType: `image/${match[1]}` };
}

export async function POST(request: Request) {
  const student = await getActiveStudent();
  if (!student) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const body = await request.json().catch(() => null) as null | { imageData?: string };
  try {
    const { bytes, contentType } = decodeImageData(body?.imageData || "");
    const id = await saveMistakeImage(student.id, bytes, contentType);
    return NextResponse.json({ id });
  } catch {
    return NextResponse.json({ error: "错题照片保存失败" }, { status: 400 });
  }
}

export async function GET(request: Request) {
  const student = await getActiveStudent();
  if (!student) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id") || "";
  if (!idPattern.test(id)) return NextResponse.json({ error: "照片编号无效" }, { status: 400 });
  try {
    const image = await getMistakeImage(student.id, id);
    if (!image) return NextResponse.json({ error: "照片不存在" }, { status: 404 });
    return new Response(image.body, {
      headers: {
        "cache-control": "private, max-age=3600",
        "content-type": image.contentType,
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "照片暂时不可用" }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  const student = await getActiveStudent();
  if (!student) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id") || "";
  if (!idPattern.test(id)) return NextResponse.json({ error: "照片编号无效" }, { status: 400 });
  try {
    await deleteMistakeImage(student.id, id);
    return NextResponse.json({ deleted: true });
  } catch {
    return NextResponse.json({ error: "照片删除失败" }, { status: 503 });
  }
}
