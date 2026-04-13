import { load } from "cheerio";
import { NextRequest, NextResponse } from "next/server";

import type { CharacterSource, CharacterSummary } from "@/types/character";

export const dynamic = "force-dynamic";

type UnknownRecord = Record<string, unknown>;
type ClassMeta = {
  classId: number;
  className: string;
  classKey?: string;
  classIconUrl?: string | null;
};

const DEFAULT_PAGE_SIZE = 40;
const DETAIL_ENRICH_LIMIT = 20;
const DETAIL_BATCH_SIZE = 5;
const CLASS_MAP_TTL_MS = 10 * 60 * 1000;
const CLASS_ICON_BASE_URL = "https://assets.playnccdn.com/static-aion2/characters/img/class";
const CLASS_KEY_ALIAS: Record<string, string> = {
  gladiator: "gladiator",
  templar: "templar",
  ranger: "ranger",
  assassin: "assassin",
  elementalist: "elementalist",
  sorcerer: "sorcerer",
  cleric: "cleric",
  chanter: "chanter",
  검성: "gladiator",
  수호성: "templar",
  궁성: "ranger",
  살성: "assassin",
  정령성: "elementalist",
  마도성: "sorcerer",
  치유성: "cleric",
  호법성: "chanter",
};

let classMapCache:
  | {
      fetchedAt: number;
      byPcId: Map<number, ClassMeta>;
    }
  | null = null;

function sanitizeName(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(/<[^>]+>/g, "").trim();
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const compact = value.trim().replace(/,/g, "").replace(/\s+/g, "");
    const parsed = Number(compact);
    if (Number.isFinite(parsed)) {
      return parsed;
    }

    const matched = compact.match(/-?\d+(?:\.\d+)?/);
    if (matched) {
      const extracted = Number(matched[0]);
      if (Number.isFinite(extracted)) {
        return extracted;
      }
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

function pickPositiveNumberFromValues(values: unknown[], fallback = 0): number {
  for (const value of values) {
    const numeric = toNumber(value, NaN);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric;
    }
  }
  return fallback;
}

function toAbsoluteProfileUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }

  if (value.startsWith("/game_profile_images")) {
    return `https://profileimg.plaync.com${value}`;
  }

  if (value.startsWith("/")) {
    return `https://aion2.plaync.com${value}`;
  }

  return value;
}

function toOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeClassKey(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const raw = value.trim();
  if (!raw) {
    return undefined;
  }

  const aliased = CLASS_KEY_ALIAS[raw] ?? CLASS_KEY_ALIAS[raw.toLowerCase()];
  if (aliased) {
    return aliased;
  }

  const lowered = raw.toLowerCase();
  if (/^[a-z0-9_\-\s]+$/.test(lowered)) {
    return lowered.replace(/[\s-]+/g, "_");
  }

  return undefined;
}

function toClassIconUrl(classKey?: string): string | null {
  if (!classKey) {
    return null;
  }
  return `${CLASS_ICON_BASE_URL}/class_icon_${classKey}.png`;
}

function deriveClassKey(...candidates: unknown[]): string | undefined {
  for (const candidate of candidates) {
    const normalized = normalizeClassKey(candidate);
    if (normalized) {
      return normalized;
    }
  }
  return undefined;
}

async function fetchJson<T>(url: string, init?: RequestInit, timeoutMs = 8_000): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
      headers: {
        "accept": "application/json, text/plain, */*",
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        ...(init?.headers ?? {}),
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from ${url}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function getPlayNcClassMap(): Promise<Map<number, ClassMeta>> {
  if (classMapCache && Date.now() - classMapCache.fetchedAt < CLASS_MAP_TTL_MS) {
    return classMapCache.byPcId;
  }

  const payload = await fetchJson<{ pcDataList?: UnknownRecord[] }>(
    "https://aion2.plaync.com/api/gameinfo/pcdata?lang=ko-kr",
  );
  const list = Array.isArray(payload.pcDataList) ? payload.pcDataList : [];

  const byPcId = new Map<number, ClassMeta>();
  for (const item of list) {
    const classId = toNumber(item.id);
    if (!classId) {
      continue;
    }
    const classKey = deriveClassKey(item.className, item.classText);

    byPcId.set(classId, {
      classId,
      className: String(item.classText ?? item.className ?? "").trim() || "미확인",
      classKey,
      classIconUrl: toClassIconUrl(classKey),
    });
  }

  classMapCache = {
    fetchedAt: Date.now(),
    byPcId,
  };
  return byPcId;
}

function normalizeAon2Payload(payload: unknown): CharacterSummary[] {
  const root = payload as UnknownRecord | undefined;
  const candidates = [
    payload,
    root?.list,
    (root?.data as UnknownRecord | undefined)?.list,
    root?.data,
  ];

  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) {
      continue;
    }

    const mapped: CharacterSummary[] = [];

    for (const item of candidate) {
      const record = item as UnknownRecord;
      const stats = asRecord(record.stats) ?? asRecord(record.stat) ?? {};

      const characterId = String(record.characterId ?? record.id ?? "").trim();
      const rawName = sanitizeName(record.name ?? record.characterName);
      const serverId = toNumber(record.serverId);
      const serverName = String(record.serverName ?? record.server ?? "").trim();

      if (!characterId || !rawName || !serverId || !serverName) {
        continue;
      }

      const raceValue = toNumber(record.race || record.raceId || 0);
      const classId = toNumber(record.classId ?? record.pcId);
      const className =
        toOptionalString(record.className) ??
        toOptionalString(record.classText) ??
        toOptionalString(record.job);
      const classKey = deriveClassKey(record.classKey, record.className, record.classText, record.job);
      const itemLevel = pickPositiveNumberFromValues([
        record.totalItemLevel,
        record.itemLevel,
        record.itemLv,
        record.item_level,
        record.total_item_level,
        record.equipmentItemLevel,
        stats.totalItemLevel,
        stats.itemLevel,
        stats.itemLv,
      ]);
      const combatPower = pickPositiveNumberFromValues([
        record.maxCombatPower,
        record.combatPower,
        record.battlePower,
        record.totalCombatPower,
        record.maxBattlePower,
        record.cp,
        stats.maxCombatPower,
        stats.combatPower,
        stats.battlePower,
        stats.cp,
      ]);

      mapped.push({
        id: `${serverId}:${characterId}`,
        characterId,
        name: rawName,
        serverId,
        serverName,
        level: toNumber(record.level),
        race: raceValue > 0 ? raceValue : undefined,
        classId: classId || undefined,
        className,
        classKey,
        classIconUrl: toClassIconUrl(classKey),
        itemLevel,
        combatPower,
        profileImageUrl: toAbsoluteProfileUrl(record.profileImageUrl ?? record.profileImage),
        source: "aon2-api" as CharacterSource,
      });
    }

    if (mapped.length > 0) {
      return mapped;
    }
  }

  return [];
}

async function searchWithAon2Api(name: string, serverId?: number, size = DEFAULT_PAGE_SIZE) {
  const queryVariants: Array<Record<string, string>> = [
    { keyword: name },
    { name },
    { q: name },
  ];

  for (const variant of queryVariants) {
    const params = new URLSearchParams(variant);
    params.set("size", String(size));
    if (serverId) {
      params.set("serverId", String(serverId));
    }

    try {
      const payload = await fetchJson<unknown>(
        `https://api.aon2.info/api/v1/aion2/characters/search-by-name?${params.toString()}`,
      );
      const normalized = normalizeAon2Payload(payload);
      if (normalized.length > 0) {
        return normalized;
      }
    } catch {
      // Keep trying other query param names.
    }
  }

  return [];
}

function mapPlayNcSearchItem(item: UnknownRecord, classMap: Map<number, ClassMeta>): CharacterSummary | null {
  const characterId = String(item.characterId ?? "").trim();
  const serverId = toNumber(item.serverId);
  const serverName = String(item.serverName ?? "").trim();
  const name = sanitizeName(item.name);
  const classId = toNumber(item.pcId);
  const classMeta = classMap.get(classId);
  const className = classMeta?.className ?? toOptionalString(item.classText) ?? toOptionalString(item.className);
  const classKey = classMeta?.classKey ?? deriveClassKey(item.className, item.classText);

  if (!characterId || !serverId || !serverName || !name) {
    return null;
  }

  const itemLevel = pickPositiveNumberFromValues([
    item.itemLevel,
    item.totalItemLevel,
    item.itemLv,
    item.item_level,
  ]);
  const combatPower = pickPositiveNumberFromValues([
    item.combatPower,
    item.maxCombatPower,
    item.battlePower,
    item.totalCombatPower,
    item.cp,
  ]);

  return {
    id: `${serverId}:${characterId}`,
    characterId,
    name,
    serverId,
    serverName,
    level: toNumber(item.level),
    race: toNumber(item.race) || undefined,
    classId: classId || undefined,
    className,
    classKey,
    classIconUrl: classMeta?.classIconUrl ?? toClassIconUrl(classKey),
    itemLevel,
    combatPower,
    profileImageUrl: toAbsoluteProfileUrl(item.profileImageUrl),
    source: "plaync-api",
  };
}

async function fetchPlayNcCharacterDetail(characterId: string, serverId: number) {
  let normalizedCharacterId = characterId;
  try {
    normalizedCharacterId = decodeURIComponent(characterId);
  } catch {
    normalizedCharacterId = characterId;
  }

  const params = new URLSearchParams({
    lang: "ko-kr",
    characterId: normalizedCharacterId,
    serverId: String(serverId),
  });

  const detail = await fetchJson<UnknownRecord>(
    `https://aion2.plaync.com/api/character/info?${params.toString()}`,
  );

  const statList =
    ((detail.stat as UnknownRecord | undefined)?.statList as UnknownRecord[] | undefined) ?? [];
  const itemLevelEntry = statList.find((entry) => {
    const type = String(entry.type ?? "").toLowerCase();
    const name = String(entry.name ?? "");
    return /item[_-]?level/.test(type) || name.includes("아이템레벨");
  });
  const combatPowerEntry = statList.find((entry) => {
    const type = String(entry.type ?? "").toLowerCase();
    const name = String(entry.name ?? "");
    return /combat|battle/.test(type) || name.includes("전투력");
  });

  const profile = (detail.profile as UnknownRecord | undefined) ?? {};
  const classId = toNumber(profile.pcId);
  const classKey = deriveClassKey(profile.className);
  const detailStat = asRecord(detail.stat) ?? {};

  return {
    itemLevel: pickPositiveNumberFromValues([
      itemLevelEntry?.value,
      profile.itemLevel,
      profile.totalItemLevel,
      detail.itemLevel,
      detail.totalItemLevel,
      detailStat.itemLevel,
      detailStat.totalItemLevel,
    ]),
    combatPower: pickPositiveNumberFromValues([
      combatPowerEntry?.value,
      profile.combatPower,
      profile.maxCombatPower,
      profile.battlePower,
      detail.combatPower,
      detail.maxCombatPower,
      detailStat.combatPower,
      detailStat.maxCombatPower,
      detailStat.battlePower,
      detailStat.cp,
    ]),
    profileImageUrl: toAbsoluteProfileUrl(profile.profileImage),
    classId: classId || undefined,
    className: toOptionalString(profile.className),
    classKey,
    classIconUrl: toClassIconUrl(classKey),
  };
}

async function enrichPlayNcCharacters(
  characters: CharacterSummary[],
  classMap: Map<number, ClassMeta>,
): Promise<CharacterSummary[]> {
  const base = [...characters];
  const target = base.slice(0, DETAIL_ENRICH_LIMIT);
  const byId = new Map(base.map((character) => [character.id, character]));

  for (let index = 0; index < target.length; index += DETAIL_BATCH_SIZE) {
    const batch = target.slice(index, index + DETAIL_BATCH_SIZE);

    const results = await Promise.all(
      batch.map(async (character) => {
        try {
          const detail = await fetchPlayNcCharacterDetail(character.characterId, character.serverId);
          return { character, detail };
        } catch {
          return null;
        }
      }),
    );

    for (const item of results) {
      if (!item) {
        continue;
      }

      const entry = byId.get(item.character.id);
      if (!entry) {
        continue;
      }

      if (item.detail.itemLevel > 0) {
        entry.itemLevel = item.detail.itemLevel;
      }
      if (item.detail.combatPower > 0) {
        entry.combatPower = item.detail.combatPower;
      }
      entry.profileImageUrl = item.detail.profileImageUrl ?? entry.profileImageUrl;
      entry.classId = item.detail.classId ?? entry.classId;
      entry.className = item.detail.className ?? entry.className;
      entry.classKey = item.detail.classKey ?? entry.classKey;
      entry.classIconUrl = item.detail.classIconUrl ?? entry.classIconUrl;

      if (entry.classId) {
        const classMeta = classMap.get(entry.classId);
        if (classMeta) {
          entry.className = entry.className ?? classMeta.className;
          entry.classKey = entry.classKey ?? classMeta.classKey;
          entry.classIconUrl = classMeta.classIconUrl ?? toClassIconUrl(entry.classKey);
        }
      }
    }
  }

  return base;
}

async function enrichMissingStatsFromPlayNcDetail(
  characters: CharacterSummary[],
  classMap: Map<number, ClassMeta>,
): Promise<CharacterSummary[]> {
  const base = [...characters];
  const byId = new Map(base.map((character) => [character.id, character]));
  const target = base
    .filter((character) => character.itemLevel <= 0 || character.combatPower <= 0)
    .slice(0, DETAIL_ENRICH_LIMIT);

  for (let index = 0; index < target.length; index += DETAIL_BATCH_SIZE) {
    const batch = target.slice(index, index + DETAIL_BATCH_SIZE);

    const results = await Promise.all(
      batch.map(async (character) => {
        try {
          const detail = await fetchPlayNcCharacterDetail(character.characterId, character.serverId);
          return { character, detail };
        } catch {
          return null;
        }
      }),
    );

    for (const item of results) {
      if (!item) {
        continue;
      }

      const entry = byId.get(item.character.id);
      if (!entry) {
        continue;
      }

      if (item.detail.itemLevel > 0 && entry.itemLevel <= 0) {
        entry.itemLevel = item.detail.itemLevel;
      }
      if (item.detail.combatPower > 0 && entry.combatPower <= 0) {
        entry.combatPower = item.detail.combatPower;
      }
      entry.profileImageUrl = entry.profileImageUrl ?? item.detail.profileImageUrl;

      if (!entry.classId) {
        entry.classId = item.detail.classId;
      }
      if (!entry.className) {
        entry.className = item.detail.className;
      }
      if (!entry.classKey) {
        entry.classKey = item.detail.classKey;
      }
      if (!entry.classIconUrl) {
        entry.classIconUrl = item.detail.classIconUrl;
      }

      if (entry.classId) {
        const classMeta = classMap.get(entry.classId);
        if (classMeta) {
          entry.className = entry.className ?? classMeta.className;
          entry.classKey = entry.classKey ?? classMeta.classKey;
          entry.classIconUrl = entry.classIconUrl ?? classMeta.classIconUrl ?? toClassIconUrl(entry.classKey);
        }
      }
    }
  }

  return base;
}

async function searchWithPlayNcApi(name: string, serverId?: number, size = DEFAULT_PAGE_SIZE) {
  const params = new URLSearchParams({
    keyword: name,
    page: "0",
    size: String(size),
  });

  if (serverId) {
    params.set("serverId", String(serverId));
  }

  const payload = await fetchJson<{ list?: UnknownRecord[] }>(
    `https://aion2.plaync.com/ko-kr/api/search/aion2/search/v2/character?${params.toString()}`,
  );
  const classMap = await getPlayNcClassMap();

  const list = Array.isArray(payload.list) ? payload.list : [];
  const mapped = list
    .map((item) => mapPlayNcSearchItem(item, classMap))
    .filter((item): item is CharacterSummary => !!item);

  if (mapped.length === 0) {
    return [];
  }

  return enrichPlayNcCharacters(mapped, classMap);
}

async function searchWithPlayNcScrape(name: string, serverId?: number): Promise<CharacterSummary[]> {
  const params = new URLSearchParams({ keyword: name });
  if (serverId) {
    params.set("serverId", String(serverId));
  }

  const html = await fetch(`https://aion2.plaync.com/ko-kr/characters/index?${params.toString()}`, {
    cache: "no-store",
    headers: {
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    },
  }).then(async (response) => {
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from characters index`);
    }
    return response.text();
  });

  const $ = load(html);
  const found: CharacterSummary[] = [];

  const selectors = ["[data-character-id]", ".character-card", ".search-result-item"];
  const seen = new Set<string>();

  for (const selector of selectors) {
    $(selector).each((_, element) => {
      const el = $(element);
      const characterId =
        (el.attr("data-character-id") || el.find("[data-character-id]").attr("data-character-id") || "").trim();

      const name = sanitizeName(
        el.attr("data-character-name") ||
          el.find(".character-name").text() ||
          el.find(".name").text() ||
          el.text(),
      );

      const serverId =
        toNumber(el.attr("data-server-id")) ||
        toNumber(el.find("[data-server-id]").attr("data-server-id")) ||
        0;

      const serverName =
        (el.attr("data-server-name") ||
          el.find(".server-name").text() ||
          el.find(".server").text() ||
          "")
          .replace(/\s+/g, " ")
          .trim();
      const itemLevel = pickPositiveNumberFromValues([
        el.attr("data-item-level"),
        el.attr("data-itemlevel"),
        el.find("[data-item-level]").attr("data-item-level"),
        el.find(".item-level").text(),
        el.find(".itemlevel").text(),
      ]);
      const combatPower = pickPositiveNumberFromValues([
        el.attr("data-combat-power"),
        el.attr("data-combatpower"),
        el.find("[data-combat-power]").attr("data-combat-power"),
        el.find(".combat-power").text(),
        el.find(".cp").text(),
      ]);

      if (!characterId || !name || !serverId || !serverName) {
        return;
      }

      const id = `${serverId}:${characterId}`;
      if (seen.has(id)) {
        return;
      }

      seen.add(id);
      found.push({
        id,
        characterId,
        name,
        serverId,
        serverName,
        level: 0,
        race: undefined,
        classId: undefined,
        className: undefined,
        classKey: undefined,
        classIconUrl: null,
        itemLevel,
        combatPower,
        profileImageUrl: toAbsoluteProfileUrl(el.find("img").first().attr("src")),
        source: "plaync-scrape",
      });
    });

    if (found.length > 0) {
      break;
    }
  }

  return found;
}

export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get("name")?.trim() ?? "";
  const serverIdRaw = request.nextUrl.searchParams.get("serverId")?.trim() ?? "";
  const sizeRaw = request.nextUrl.searchParams.get("size")?.trim() ?? "";

  if (!name) {
    return NextResponse.json({ error: "name 파라미터가 필요합니다." }, { status: 400 });
  }

  const serverId = serverIdRaw ? toNumber(serverIdRaw, 0) || undefined : undefined;
  const size = Math.min(Math.max(toNumber(sizeRaw, DEFAULT_PAGE_SIZE), 1), DEFAULT_PAGE_SIZE);

  const warnings: string[] = [];

  try {
    const aon2 = await searchWithAon2Api(name, serverId, size);
    if (aon2.length > 0) {
      let enriched = aon2;
      try {
        const classMap = await getPlayNcClassMap();
        enriched = await enrichMissingStatsFromPlayNcDetail(aon2, classMap);
      } catch (error) {
        warnings.push(`plaync detail enrich on aon2 error: ${error instanceof Error ? error.message : "unknown"}`);
      }

      return NextResponse.json({
        source: "aon2-api",
        items: enriched,
        warnings,
      });
    }
    warnings.push("aon2 api no result");
  } catch (error) {
    warnings.push(`aon2 api error: ${error instanceof Error ? error.message : "unknown"}`);
  }

  try {
    const playncApi = await searchWithPlayNcApi(name, serverId, size);
    if (playncApi.length > 0) {
      return NextResponse.json({
        source: "plaync-api",
        items: playncApi,
        warnings,
      });
    }
    warnings.push("plaync api no result");
  } catch (error) {
    warnings.push(`plaync api error: ${error instanceof Error ? error.message : "unknown"}`);
  }

  try {
    const scraped = await searchWithPlayNcScrape(name, serverId);
    if (scraped.length > 0) {
      let enriched = scraped;
      try {
        const classMap = await getPlayNcClassMap();
        enriched = await enrichMissingStatsFromPlayNcDetail(scraped, classMap);
      } catch (error) {
        warnings.push(`plaync detail enrich on scrape error: ${error instanceof Error ? error.message : "unknown"}`);
      }

      return NextResponse.json({
        source: "plaync-scrape",
        items: enriched,
        warnings,
      });
    }
    warnings.push("plaync scrape no result");
  } catch (error) {
    warnings.push(`plaync scrape error: ${error instanceof Error ? error.message : "unknown"}`);
  }

  return NextResponse.json(
    {
      error: "캐릭터를 찾지 못했습니다.",
      items: [],
      warnings,
    },
    { status: 404 },
  );
}
