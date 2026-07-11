import type { Metadata, Viewport } from "next";
import "./globals.css";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export const metadata: Metadata = {
  title: "龟龟伴读 · 你的学习小伙伴",
  description: "和电子宠物小乌龟一起读书、聊天、旅行，在每天的小互动里快乐成长。",
  icons: {
    icon: `${basePath}/assets/icons/status/status_mood.png`,
    shortcut: `${basePath}/assets/icons/status/status_mood.png`,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
