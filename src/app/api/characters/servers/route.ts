import { NextResponse } from "next/server";

import type { ServerInfo } from "@/types/character";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const response = await fetch("https://aion2.plaync.com/api/gameinfo/servers?lang=ko-kr", {
      cache: "no-store",
      headers: {
        "accept": "application/json, text/plain, */*",
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = (await response.json()) as { serverList?: ServerInfo[] };
    const list = Array.isArray(payload.serverList) ? payload.serverList : [];

    return NextResponse.json({
      items: list.sort((a, b) => a.serverId - b.serverId),
    });
  } catch {
    return NextResponse.json({
      items: [],
      error: "서버 목록을 불러오지 못했습니다.",
    });
  }
}
