import { NextRequest, NextResponse } from "next/server";

import type { CharacterSummary } from "@/types/character";

export const dynamic = "force-dynamic";
export const runtime = "edge";

type UnknownRecord = Record<string, unknown>;
type ClassMeta = {
  classId: number;
  className: string;
  classKey?: string;
  classIconUrl?: string | null;
};

const DEFAULT_PAGE_SIZE = 40;
const DETAIL_ENRICH_LIMIT = 20;
const DETAIL_BATCH_SIZE = 4;
const CLASS_MAP_TTL_MS = 10 * 60 * 1000;
const DETAIL_CACHE_TTL_MS = 60 * 1000;
const PLAYNC_SEARCH_TIMEOUT_MS = 4_000;
const PLAYNC_DETAIL_TIMEOUT_MS = 1_800;
const PLAYNC_CLASS_MAP_TIMEOUT_MS = 1_500;
const CLASS_ICON_BASE_URL = "https://assets.playnccdn.com/static-aion2/characters/img/class";
const MAX_WARNING_COUNT = 8;
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

let detailCache = new Map<
  string,
  {
    fetchedAt: number;
    detail: PlayNcCharacterDetail;
  }
>();

function createClassMeta(classId: number, className: string): ClassMeta {
  const classKey = deriveClassKey(className);
  return {
    classId,
    className,
    classKey,
    classIconUrl: toClassIconUrl(classKey),
  };
}

function createFallbackClassMap(): Map<number, ClassMeta> {
  const classNames = ["검성", "수호성", "궁성", "살성", "정령성", "마도성", "치유성", "호법성"];
  const byPcId = new Map<number, ClassMeta>();

  for (let classIndex = 0; classIndex < classNames.length; classIndex += 1) {
    for (let offset = 0; offset < 4; offset += 1) {
      const classId = 5 + classIndex * 4 + offset;
      byPcId.set(classId, createClassMeta(classId, classNames[classIndex]));
    }
  }

  return byPcId;
}

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
  if (!trimmed || trimmed === "undefined" || trimmed === "$undefined" || trimmed === "null") {
    return undefined;
  }
  return trimmed;
}

function normalizeCharacterId(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  let normalized = value.trim();
  if (!normalized) {
    return "";
  }

  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const decoded = decodeURIComponent(normalized);
      if (!decoded || decoded === normalized) {
        break;
      }
      normalized = decoded;
    } catch {
      break;
    }
  }

  return normalized.trim();
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
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

    const contentType = response.headers.get("content-type") ?? "";
    const text = await response.text();

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from ${url}: ${text.slice(0, 160)}`);
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`JSON parse failed from ${url}: ${contentType || "unknown content-type"} ${text.slice(0, 160)}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

function pushWarning(warnings: string[] | undefined, message: string) {
  if (!warnings || warnings.length >= MAX_WARNING_COUNT) {
    return;
  }
  warnings.push(message);
}

async function getPlayNcClassMap(): Promise<Map<number, ClassMeta>> {
  if (classMapCache && Date.now() - classMapCache.fetchedAt < CLASS_MAP_TTL_MS) {
    return classMapCache.byPcId;
  }

  let payload: { pcDataList?: UnknownRecord[] };
  try {
    payload = await fetchJson<{ pcDataList?: UnknownRecord[] }>(
      "https://aion2.plaync.com/api/gameinfo/pcdata?lang=ko-kr",
      undefined,
      PLAYNC_CLASS_MAP_TIMEOUT_MS,
    );
  } catch {
    const fallback = createFallbackClassMap();
    classMapCache = {
      fetchedAt: Date.now(),
      byPcId: fallback,
    };
    return fallback;
  }

  const list = Array.isArray(payload.pcDataList) ? payload.pcDataList : [];

  if (list.length === 0) {
    const fallback = createFallbackClassMap();
    classMapCache = {
      fetchedAt: Date.now(),
      byPcId: fallback,
    };
    return fallback;
  }

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

  const resolved = byPcId.size > 0 ? byPcId : createFallbackClassMap();

  classMapCache = {
    fetchedAt: Date.now(),
    byPcId: resolved,
  };
  return resolved;
}

function mapPlayNcSearchItem(item: UnknownRecord, classMap: Map<number, ClassMeta>): CharacterSummary | null {
  const characterId = normalizeCharacterId(item.characterId);
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

type PlayNcCharacterDetail = {
  itemLevel: number;
  combatPower: number;
  profileImageUrl: string | null;
  classId?: number;
  className?: string;
  classKey?: string;
  classIconUrl: string | null;
};

function isItemLevelStatEntry(entry: UnknownRecord): boolean {
  const type = String(entry.type ?? "").toLowerCase();
  const name = String(entry.name ?? "");
  return /item[_-]?level/.test(type) || name.includes("아이템레벨");
}

function isCombatPowerStatEntry(entry: UnknownRecord): boolean {
  const type = String(entry.type ?? "").toLowerCase();
  const name = String(entry.name ?? "");
  return /combat|battle/.test(type) || name.includes("전투력");
}

function extractPlayNcCharacterDetail(detail: UnknownRecord): PlayNcCharacterDetail {
  const profile = asRecord(detail.profile) ?? {};
  const detailStat = asRecord(detail.stat) ?? {};
  const statList = asArray(detailStat.statList)
    .map((entry) => asRecord(entry))
    .filter((entry): entry is UnknownRecord => Boolean(entry));
  const itemLevelEntry = statList.find((entry) => isItemLevelStatEntry(entry));
  const combatPowerEntry = statList.find((entry) => isCombatPowerStatEntry(entry));
  const classId = toNumber(profile.pcId);
  const classKey = deriveClassKey(profile.className);

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

function hasMeaningfulPlayNcCharacterDetail(detail: PlayNcCharacterDetail): boolean {
  return detail.itemLevel > 0 || detail.combatPower > 0 || Boolean(detail.className);
}

function detailCacheKey(characterId: string, serverId: number) {
  return `${serverId}:${normalizeCharacterId(characterId)}`;
}

async function fetchPlayNcCharacterDetail(characterId: string, serverId: number): Promise<PlayNcCharacterDetail> {
  const normalizedCharacterId = normalizeCharacterId(characterId);
  const cacheKey = detailCacheKey(normalizedCharacterId, serverId);
  const cached = detailCache.get(cacheKey);

  if (cached && Date.now() - cached.fetchedAt < DETAIL_CACHE_TTL_MS) {
    return cached.detail;
  }

  const languages = ["ko-kr"];
  const detailReferer = `https://aion2.plaync.com/ko-kr/characters/${serverId}/${encodeURIComponent(normalizedCharacterId)}`;
  const headerVariants: Array<HeadersInit | undefined> = [
    {
      "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      "origin": "https://aion2.plaync.com",
      "referer": detailReferer,
      "x-requested-with": "XMLHttpRequest",
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
    },
  ];

  let fallbackDetail: PlayNcCharacterDetail | null = null;
  let lastError: unknown = null;

  for (let retry = 0; retry < 1; retry += 1) {
    for (const lang of languages) {
      for (const headers of headerVariants) {
        try {
          const params = new URLSearchParams({
            lang,
            characterId: normalizedCharacterId,
            serverId: String(serverId),
            t: String(Date.now()),
          });

          const payload = await fetchJson<UnknownRecord>(
            `https://aion2.plaync.com/api/character/info?${params.toString()}`,
            { headers },
            PLAYNC_DETAIL_TIMEOUT_MS,
          );
          const detail = extractPlayNcCharacterDetail(payload);
          fallbackDetail = detail;

          if (hasMeaningfulPlayNcCharacterDetail(detail)) {
            detailCache.set(cacheKey, { fetchedAt: Date.now(), detail });
            return detail;
          }
        } catch (error) {
          lastError = error;
        }
      }
    }
  }

  if (fallbackDetail) {
    detailCache.set(cacheKey, { fetchedAt: Date.now(), detail: fallbackDetail });
    return fallbackDetail;
  }

  throw lastError instanceof Error ? lastError : new Error("plaync detail unavailable");
}

async function enrichPlayNcCharacters(
  characters: CharacterSummary[],
  classMap: Map<number, ClassMeta>,
  warnings?: string[],
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
        } catch (error) {
          pushWarning(
            warnings,
            `detail failed ${character.name}[${character.serverName}]: ${error instanceof Error ? error.message : "unknown"}`,
          );
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
      if (item.detail.itemLevel <= 0 || item.detail.combatPower <= 0) {
        pushWarning(
          warnings,
          `detail empty stats ${entry.name}[${entry.serverName}]: IL ${item.detail.itemLevel}, CP ${item.detail.combatPower}`,
        );
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
  warnings?: string[],
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
        } catch (error) {
          pushWarning(
            warnings,
            `detail failed ${character.name}[${character.serverName}]: ${error instanceof Error ? error.message : "unknown"}`,
          );
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
      if (item.detail.itemLevel <= 0 || item.detail.combatPower <= 0) {
        pushWarning(
          warnings,
          `detail empty stats ${entry.name}[${entry.serverName}]: IL ${item.detail.itemLevel}, CP ${item.detail.combatPower}`,
        );
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

async function searchWithPlayNcApi(
  name: string,
  serverId?: number,
  size = DEFAULT_PAGE_SIZE,
  warnings?: string[],
) {
  const fetchSearchList = async (targetServerId?: number) => {
    const params = new URLSearchParams({
      keyword: name,
      page: "0",
      size: String(size),
    });

    if (targetServerId) {
      params.set("serverId", String(targetServerId));
    }

    const payload = await fetchJson<{ list?: UnknownRecord[] }>(
      `https://aion2.plaync.com/ko-kr/api/search/aion2/search/v2/character?${params.toString()}`,
      undefined,
      PLAYNC_SEARCH_TIMEOUT_MS,
    );

    return Array.isArray(payload.list) ? payload.list : [];
  };

  const classMap = await getPlayNcClassMap();
  let list = await fetchSearchList(serverId);

  if (serverId && list.length === 0) {
    list = await fetchSearchList();
  }

  const mapped = list
    .map((item) => mapPlayNcSearchItem(item, classMap))
    .filter((item): item is CharacterSummary => !!item);

  if (mapped.length === 0) {
    return [];
  }

  return enrichPlayNcCharacters(mapped, classMap, warnings);
}

async function searchWithPlayNcScrape(name: string, serverId?: number): Promise<CharacterSummary[]> {
  void name;
  void serverId;
  return [];
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
    const playncApi = await searchWithPlayNcApi(name, serverId, size, warnings);
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
        enriched = await enrichMissingStatsFromPlayNcDetail(scraped, classMap, warnings);
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

  return NextResponse.json({
    source: "not-found",
    items: [],
    warnings,
  });
}
