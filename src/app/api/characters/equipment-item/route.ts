import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type UnknownRecord = Record<string, unknown>;

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/,/g, "").trim());
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function normalizeCharacterId(value: string): string {
  if (!value) {
    return value;
  }
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function fetchJson<T>(url: string, timeoutMs = 8000): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        accept: "application/json, text/plain, */*",
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(request: NextRequest) {
  const idRaw = request.nextUrl.searchParams.get("id")?.trim() ?? "";
  const enchantLevelRaw = request.nextUrl.searchParams.get("enchantLevel")?.trim() ?? "";
  const characterIdRaw = request.nextUrl.searchParams.get("characterId")?.trim() ?? "";
  const serverIdRaw = request.nextUrl.searchParams.get("serverId")?.trim() ?? "";
  const slotPosRaw = request.nextUrl.searchParams.get("slotPos")?.trim() ?? "";

  const id = toNumber(idRaw, 0);
  if (!id) {
    return NextResponse.json({ error: "id 파라미터가 필요합니다." }, { status: 400 });
  }

  const enchantLevel = toNumber(enchantLevelRaw, 0);
  const serverId = toNumber(serverIdRaw, 0);
  const slotPos = toNumber(slotPosRaw, 0);
  const characterId = normalizeCharacterId(characterIdRaw);

  const errors: string[] = [];

  const equipmentParams = new URLSearchParams({
    id: String(id),
    enchantLevel: String(enchantLevel),
  });
  if (characterId && serverId > 0 && slotPos > 0) {
    equipmentParams.set("characterId", characterId);
    equipmentParams.set("serverId", String(serverId));
    equipmentParams.set("slotPos", String(slotPos));
  }

  try {
    const payload = await fetchJson<UnknownRecord>(
      `https://aion2.plaync.com/api/character/equipment/item?${equipmentParams.toString()}`,
    );
    return NextResponse.json({
      source: "plaync-equipment-item",
      characterContextApplied: Boolean(characterId && serverId > 0 && slotPos > 0),
      item: payload,
    });
  } catch (error) {
    errors.push(`equipment item: ${error instanceof Error ? error.message : "unknown"}`);
  }

  try {
    const payload = await fetchJson<UnknownRecord>(
      `https://aion2.plaync.com/api/gameconst/item?id=${id}&enchantLevel=${enchantLevel}`,
    );
    return NextResponse.json({
      source: "plaync-gameconst-item",
      characterContextApplied: false,
      item: payload,
      warnings: errors,
    });
  } catch (error) {
    errors.push(`gameconst item: ${error instanceof Error ? error.message : "unknown"}`);
  }

  return NextResponse.json(
    {
      error: "장비 상세 조회에 실패했습니다.",
      warnings: errors,
    },
    { status: 500 },
  );
}
