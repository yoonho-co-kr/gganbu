import { NextResponse } from "next/server";

import type { ServerInfo } from "@/types/character";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const preferredRegion = "icn1";

type UnknownRecord = Record<string, unknown>;

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function normalizeServers(list: unknown): ServerInfo[] {
  if (!Array.isArray(list)) {
    return [];
  }

  return list
    .map((entry) => (entry && typeof entry === "object" ? (entry as UnknownRecord) : null))
    .filter((entry): entry is UnknownRecord => Boolean(entry))
    .map((entry) => ({
      raceId: toNumber(entry.raceId, 0) || undefined,
      serverId: toNumber(entry.serverId, 0),
      serverName: String(entry.serverName ?? "").trim(),
    }))
    .filter((entry) => entry.serverId > 0 && entry.serverName.length > 0)
    .sort((a, b) => a.serverId - b.serverId);
}

async function fetchPlayNcServers(): Promise<{ items: ServerInfo[]; source: string; warnings: string[] }> {
  const warnings: string[] = [];

  const urls = [
    "https://aion2.plaync.com/api/gameinfo/servers?lang=ko-kr",
    "https://aion2.plaync.com/ko-kr/api/gameinfo/servers?lang=ko-kr",
    "https://aion2.plaync.com/api/gameinfo/servers?lang=ko",
    "https://aion2.plaync.com/ko/api/gameinfo/servers?lang=ko",
  ];
  const headerVariants: Array<{ source: string; headers?: HeadersInit }> = [
    {
      source: "plaync-origin-referer",
      headers: {
        origin: "https://aion2.plaync.com",
        referer: "https://aion2.plaync.com/ko-kr/characters/index",
      },
    },
    {
      source: "plaync-basic",
      headers: undefined,
    },
  ];

  for (const url of urls) {
    for (const variant of headerVariants) {
      try {
        const response = await fetch(url, {
          cache: "no-store",
          headers: {
            accept: "application/json, text/plain, */*",
            "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
            "user-agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
            ...(variant.headers ?? {}),
          },
        });

        if (!response.ok) {
          warnings.push(`${variant.source} ${url} -> HTTP ${response.status}`);
          continue;
        }

        const payload = (await response.json()) as { serverList?: unknown };
        const items = normalizeServers(payload.serverList);
        if (items.length > 0) {
          return {
            items,
            source: variant.source,
            warnings,
          };
        }

        warnings.push(`${variant.source} ${url} -> empty serverList`);
      } catch (error) {
        warnings.push(
          `${variant.source} ${url} -> ${error instanceof Error ? error.message : "unknown error"}`,
        );
      }
    }
  }

  return {
    items: [],
    source: "plaync-unavailable",
    warnings,
  };
}

export async function GET() {
  const result = await fetchPlayNcServers();

  if (result.items.length > 0) {
    return NextResponse.json({
      source: result.source,
      items: result.items,
      warnings: result.warnings,
    });
  }

  return NextResponse.json(
    {
      source: result.source,
      items: [],
      error: "PlayNC 서버 목록 API 연결에 실패했습니다.",
      warnings: result.warnings,
    },
    { status: 502 },
  );
}
