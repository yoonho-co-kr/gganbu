import { NextResponse } from "next/server";

import type { ServerInfo } from "@/types/character";

export const dynamic = "force-dynamic";

const FALLBACK_SERVERS: ServerInfo[] = [
  { raceId: 1, serverId: 1001, serverName: "시엘" },
  { raceId: 1, serverId: 1002, serverName: "네자칸" },
  { raceId: 1, serverId: 1003, serverName: "바이젤" },
  { raceId: 1, serverId: 1004, serverName: "카이시넬" },
  { raceId: 1, serverId: 1005, serverName: "유스티엘" },
  { raceId: 1, serverId: 1006, serverName: "아리엘" },
  { raceId: 1, serverId: 1007, serverName: "프레기온" },
  { raceId: 1, serverId: 1008, serverName: "메스람타에다" },
  { raceId: 1, serverId: 1009, serverName: "히타니에" },
  { raceId: 1, serverId: 1010, serverName: "나니아" },
  { raceId: 1, serverId: 1011, serverName: "타하바타" },
  { raceId: 1, serverId: 1012, serverName: "루터스" },
  { raceId: 1, serverId: 1013, serverName: "페르노스" },
  { raceId: 1, serverId: 1014, serverName: "다미누" },
  { raceId: 1, serverId: 1015, serverName: "카사카" },
  { raceId: 1, serverId: 1016, serverName: "바카르마" },
  { raceId: 1, serverId: 1017, serverName: "챈가룽" },
  { raceId: 1, serverId: 1018, serverName: "코치룽" },
  { raceId: 1, serverId: 1019, serverName: "이슈타르" },
  { raceId: 1, serverId: 1020, serverName: "티아마트" },
  { raceId: 1, serverId: 1021, serverName: "포에타" },
  { raceId: 2, serverId: 2001, serverName: "이스라펠" },
  { raceId: 2, serverId: 2002, serverName: "지켈" },
  { raceId: 2, serverId: 2003, serverName: "트리니엘" },
  { raceId: 2, serverId: 2004, serverName: "루미엘" },
  { raceId: 2, serverId: 2005, serverName: "마르쿠탄" },
  { raceId: 2, serverId: 2006, serverName: "아스펠" },
  { raceId: 2, serverId: 2007, serverName: "에레슈키갈" },
  { raceId: 2, serverId: 2008, serverName: "브리트라" },
  { raceId: 2, serverId: 2009, serverName: "네몬" },
  { raceId: 2, serverId: 2010, serverName: "하달" },
  { raceId: 2, serverId: 2011, serverName: "루드라" },
  { raceId: 2, serverId: 2012, serverName: "울고른" },
  { raceId: 2, serverId: 2013, serverName: "무닌" },
  { raceId: 2, serverId: 2014, serverName: "오다르" },
  { raceId: 2, serverId: 2015, serverName: "젠카카" },
  { raceId: 2, serverId: 2016, serverName: "크로메데" },
  { raceId: 2, serverId: 2017, serverName: "콰이링" },
  { raceId: 2, serverId: 2018, serverName: "바바룽" },
  { raceId: 2, serverId: 2019, serverName: "파프니르" },
  { raceId: 2, serverId: 2020, serverName: "인드나흐" },
  { raceId: 2, serverId: 2021, serverName: "이스할겐" },
];

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

    if (list.length === 0) {
      return NextResponse.json({
        items: FALLBACK_SERVERS,
        source: "static-fallback",
        warning: "PlayNC 서버 목록이 비어 정적 서버 목록을 사용했습니다.",
      });
    }

    return NextResponse.json({
      items: list.sort((a, b) => a.serverId - b.serverId),
    });
  } catch {
    return NextResponse.json({
      items: FALLBACK_SERVERS,
      source: "static-fallback",
      warning: "서버 목록을 불러오지 못해 정적 서버 목록을 사용했습니다.",
    });
  }
}
