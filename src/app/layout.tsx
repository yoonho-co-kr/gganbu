import type { Metadata } from "next";
import { SpeedInsights } from "@vercel/speed-insights/next";

import "./globals.css";

export const metadata: Metadata = {
  title: "AION2 파티 빌더",
  description: "아이온2 캐릭터 검색 기반 8인(4/4) 다중 파티 편성 도구",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full bg-slate-50 text-slate-900">
        {children}
        <SpeedInsights />
      </body>
    </html>
  );
}
