import { NextResponse } from "next/server";
import { getActiveStudent } from "../../auth-user";
import { deleteMistakeImage, getMistakeImage, saveMistakeImage } from "../../../db/mistake-images";
import { decodeImageDataUrl } from "../../../lib/image-data";
import { mutationOriginError, validMutationOrigin } from "../../../lib/request-security";

const idPattern = /^[0-9a-f-]{36}$/;

function decodeImageData(imageData: string) {
  return decodeImageDataUrl(imageData, {
    maxDataLength: 2_700_000,
    maxBytes: 1_900_000,
    maxPixels: 12_000_000,
  });
}

export async function POST(request: Request) {
  if (!validMutationOrigin(request)) return mutationOriginError();
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
  if (!validMutationOrigin(request)) return mutationOriginError();
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
