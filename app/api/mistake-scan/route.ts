import { NextResponse } from "next/server";
import { getActiveStudent } from "../../auth-user";
import { analyzeMistakeImage, mistakeModelSource, validateMistakeImageData } from "../../../lib/mistake-ai";

type ScanRequest = { imageData?: string };

export async function POST(request: Request) {
  if (!await getActiveStudent()) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  let body: ScanRequest;
  try {
    body = (await request.json()) as ScanRequest;
  } catch {
    return NextResponse.json({ error: "图片数据无效" }, { status: 400 });
  }

  const imageData = body.imageData || "";
  if (!validateMistakeImageData(imageData)) {
    return NextResponse.json({ error: "请上传清晰的 JPG、PNG 或 WebP 题目照片" }, { status: 400 });
  }

  const apiKey = process.env.MIMO_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "错题扫描服务尚未配置" }, { status: 503 });
  }

  try {
    const result = await analyzeMistakeImage(imageData);
    return NextResponse.json({ result, source: mistakeModelSource() });
  } catch {
    return NextResponse.json({ error: "这张照片暂时没有识别清楚，请重新拍照或换一张图片" }, { status: 502 });
  }
}
