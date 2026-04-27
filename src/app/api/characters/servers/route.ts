import { NextResponse } from "next/server";

import type { ServerInfo } from "@/types/character";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const preferredRegion = "icn1";

type UnknownRecord = Record<string, unknown>;

const FALLBACK_SERVERS: ServerInfo[] = [
  { serverId: 1001, serverName: "시엘" },
  { serverId: 1002, serverName: "네자칸" },
  { serverId: 1003, serverName: "바이젤" },
  { serverId: 1007, serverName: "프레기온" },
  { serverId: 1008, serverName: "메스람타에다" },
  { serverId: 1009, serverName: "히타니에" },
  { serverId: 1011, serverName: "타하바타" },
  { serverId: 1018, serverName: "코치룽" },
  { serverId: 1021, serverName: "포에타" },
  { serverId: 2001, serverName: "이스라펠" },
  { serverId: 2002, serverName: "지켈" },
  { serverId: 2003, serverName: "트리니엘" },
  { serverId: 2013, serverName: "무닌" },
];

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

function asRecord(value: unknown): UnknownRecord | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  return value as UnknownRecord;
}

function toOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeFlatServerEntry(entry: UnknownRecord, raceIdFallback?: number): ServerInfo | null {
  const serverId = toNumber(entry.serverId ?? entry.id ?? entry.value, 0);
  const serverName =
    toOptionalString(entry.serverName) ??
    toOptionalString(entry.name) ??
    toOptionalString(entry.label) ??
    toOptionalString(entry.text) ??
    "";
  const raceId = toNumber(entry.raceId ?? raceIdFallback, 0) || undefined;

  if (serverId <= 0 || !serverName) {
    return null;
  }

  return {
    raceId,
    serverId,
    serverName,
  };
}

function flattenServerEntries(input: unknown, raceIdFallback?: number): ServerInfo[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const items: ServerInfo[] = [];

  for (const rawEntry of input) {
    const entry = asRecord(rawEntry);
    if (!entry) {
      continue;
    }

    const children = Array.isArray(entry.children)
      ? entry.children
      : Array.isArray(entry.serverList)
        ? entry.serverList
        : Array.isArray(entry.servers)
          ? entry.servers
          : null;

    if (children) {
      const nextRaceId = toNumber(entry.raceId ?? entry.id ?? entry.value ?? raceIdFallback, 0) || raceIdFallback;
      items.push(...flattenServerEntries(children, nextRaceId));
      continue;
    }

    const normalized = normalizeFlatServerEntry(entry, raceIdFallback);
    if (normalized) {
      items.push(normalized);
    }
  }

  return items;
}

function normalizeServers(payload: unknown): ServerInfo[] {
  const root = asRecord(payload);
  const candidates: unknown[] = [
    payload,
    root?.serverList,
    root?.servers,
    root?.list,
    asRecord(root?.data)?.serverList,
    asRecord(root?.data)?.servers,
    asRecord(root?.data)?.list,
    asRecord(root?.result)?.serverList,
    asRecord(root?.result)?.servers,
    asRecord(root?.result)?.list,
  ];

  const deduped = new Map<number, ServerInfo>();

  for (const candidate of candidates) {
    for (const item of flattenServerEntries(candidate)) {
      if (!deduped.has(item.serverId)) {
        deduped.set(item.serverId, item);
      }
    }
  }

  return Array.from(deduped.values()).sort((a, b) => a.serverId - b.serverId);
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

        const payload = (await response.json()) as UnknownRecord;
        const items = normalizeServers(payload);
        if (items.length > 0) {
          return {
            items,
            source: variant.source,
            warnings,
          };
        }

        warnings.push(
          `${variant.source} ${url} -> empty normalized servers (${Object.keys(payload).slice(0, 8).join(",") || "no-keys"})`,
        );
      } catch (error) {
        warnings.push(
          `${variant.source} ${url} -> ${error instanceof Error ? error.message : "unknown error"}`,
        );
      }
    }
  }

  return {
    items: FALLBACK_SERVERS,
    source: "static-fallback",
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

  return NextResponse.json({
    source: result.source,
    items: FALLBACK_SERVERS,
    warnings: [...result.warnings, "plaync servers unavailable; static fallback used"],
  });
}
