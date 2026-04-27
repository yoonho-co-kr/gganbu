import { load } from "cheerio";
import { NextRequest, NextResponse } from "next/server";

import type { CharacterSummary } from "@/types/character";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const preferredRegion = "icn1";

type UnknownRecord = Record<string, unknown>;
type ClassMeta = {
  classId: number;
  className: string;
  classKey?: string;
  classIconUrl?: string | null;
};
type A2ToolSearchPayload = {
  success?: boolean;
  data?: UnknownRecord;
};
type A2ToolCharacterSnapshot = {
  className?: string;
  classKey?: string;
  classIconUrl?: string | null;
  itemLevel: number;
  combatPower: number;
};

const DEFAULT_PAGE_SIZE = 40;
const DETAIL_BATCH_SIZE = 2;
const A2TOOL_ENRICH_LIMIT = 12;
const CLASS_MAP_TTL_MS = 10 * 60 * 1000;
const DETAIL_CACHE_TTL_MS = 60 * 1000;
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

let detailCache = new Map<
  string,
  {
    fetchedAt: number;
    detail: {
      itemLevel: number;
      combatPower: number;
      profileImageUrl: string | null;
      classId?: number;
      className?: string;
      classKey?: string;
      classIconUrl: string | null;
    };
  }
>();

function sanitizeName(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(/<[^>]+>/g, "").trim();
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

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
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

function inferRaceCandidates(value: unknown): Array<1 | 2> {
  const race = toNumber(value, 0);
  if (race === 1) {
    return [1, 2];
  }
  if (race === 2) {
    return [2, 1];
  }
  return [1, 2];
}

function parseClassKeyFromIconUrl(iconUrl: unknown): string | undefined {
  if (typeof iconUrl !== "string" || iconUrl.length === 0) {
    return undefined;
  }

  const matched = iconUrl.match(/class_icon_([a-z0-9_]+)\.png/i);
  if (!matched?.[1]) {
    return undefined;
  }

  return normalizeClassKey(matched[1]);
}

function pickA2ToolItemLevel(payload: UnknownRecord): number {
  const statRoot = asRecord(payload.stat);
  const statList = asArray(statRoot?.statList);
  for (const entry of statList) {
    const item = asRecord(entry);
    if (!item) {
      continue;
    }

    const type = String(item.type ?? "").trim().toLowerCase();
    const name = String(item.name ?? "").trim();
    if (type === "itemlevel" || name.includes("아이템레벨")) {
      return toNumber(item.value, 0);
    }
  }
  return 0;
}

async function fetchA2ToolCharacterSnapshot(
  name: string,
  serverId: number,
  raceCandidates: Array<1 | 2>,
): Promise<A2ToolCharacterSnapshot | null> {
  if (!name.trim() || serverId <= 0) {
    return null;
  }

  const referer = `https://aion2tool.com/char/serverid=${serverId}/${encodeURIComponent(name)}`;
  const requestVariants: Array<HeadersInit> = [
    {
      "content-type": "application/json",
      origin: "https://aion2tool.com",
      referer,
    },
    {
      "content-type": "application/json",
    },
  ];

  for (const race of raceCandidates) {
    for (const headers of requestVariants) {
      try {
        const payload = await fetchJson<A2ToolSearchPayload>(
          "https://aion2tool.com/api/character/search",
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              race,
              server_id: serverId,
              keyword: name,
            }),
          },
          10_000,
        );

        if (!payload.success || !payload.data) {
          continue;
        }

        const data = asRecord(payload.data);
        if (!data) {
          continue;
        }

        const className = toOptionalString(data.job);
        const classKey = deriveClassKey(className, parseClassKeyFromIconUrl(data.job_image_url));
        return {
          className,
          classKey,
          classIconUrl: toClassIconUrl(classKey),
          itemLevel: pickA2ToolItemLevel(data),
          combatPower: pickPositiveNumberFromValues([
            data.nc_combat_power,
            data.combat_power,
            data.combatPower,
            data.maxCombatPower,
          ]),
        };
      } catch {
        // Try next header/race candidate.
      }
    }
  }

  return null;
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
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
        "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
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

type PlayNcDetailSnapshot = {
  itemLevel: number;
  combatPower: number;
  profileImageUrl: string | null;
  classId?: number;
  className?: string;
  classKey?: string;
  classIconUrl: string | null;
  hasItemLevelSignal: boolean;
  hasCombatPowerSignal: boolean;
};

type PlayNcCharacterDetail = {
  itemLevel: number;
  combatPower: number;
  profileImageUrl: string | null;
  classId?: number;
  className?: string;
  classKey?: string;
  classIconUrl: string | null;
};

function preferExistingPositiveValue(currentValue: number, nextValue: number): number {
  if (currentValue > 0) {
    return currentValue;
  }
  if (nextValue > 0) {
    return nextValue;
  }
  return currentValue;
}

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

function extractPlayNcDetailSnapshot(detail: UnknownRecord): PlayNcDetailSnapshot {
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
    hasItemLevelSignal: Boolean(itemLevelEntry),
    hasCombatPowerSignal: Boolean(combatPowerEntry),
  };
}

function hasMeaningfulPlayNcDetailSnapshot(snapshot: PlayNcDetailSnapshot): boolean {
  return (
    snapshot.itemLevel > 0 ||
    snapshot.combatPower > 0 ||
    snapshot.hasItemLevelSignal ||
    snapshot.hasCombatPowerSignal
  );
}

function getDetailCacheKey(characterId: string, serverId: number): string {
  return `${serverId}:${normalizeCharacterId(characterId)}`;
}

async function fetchPlayNcCharacterDetail(
  characterId: string,
  serverId: number,
  options?: { forceRefresh?: boolean },
): Promise<PlayNcCharacterDetail> {
  const normalizedCharacterId = normalizeCharacterId(characterId);
  const cacheKey = getDetailCacheKey(normalizedCharacterId, serverId);
  const forceRefresh = options?.forceRefresh ?? false;
  const cached = detailCache.get(cacheKey);

  if (!forceRefresh && cached && Date.now() - cached.fetchedAt < DETAIL_CACHE_TTL_MS) {
    return cached.detail;
  }

  const referer = `https://aion2.plaync.com/ko-kr/characters/${serverId}/${encodeURIComponent(normalizedCharacterId)}`;
  const languages = ["ko-kr", "ko"];
  const headerVariants: Array<HeadersInit | undefined> = [
    undefined,
    {
      origin: "https://aion2.plaync.com",
      referer,
    },
  ];
  let detail: UnknownRecord | null = null;

  for (let retry = 0; retry < 3; retry += 1) {
    for (const lang of languages) {
      for (const extraHeaders of headerVariants) {
        try {
          const params = new URLSearchParams({
            lang,
            characterId: normalizedCharacterId,
            serverId: String(serverId),
          });

          const payload = await fetchJson<UnknownRecord>(
            `https://aion2.plaync.com/api/character/info?${params.toString()}`,
            {
              headers: extraHeaders,
            },
          );

          const snapshot = extractPlayNcDetailSnapshot(payload);
          const hasData = hasMeaningfulPlayNcDetailSnapshot(snapshot);

          detail = payload;
          if (hasData) {
            break;
          }
        } catch {
          // Keep trying additional combinations.
        }
      }

      if (detail) {
        const hasData = hasMeaningfulPlayNcDetailSnapshot(extractPlayNcDetailSnapshot(detail));
        if (hasData) {
          break;
        }
      }
    }

    if (detail) {
      const hasData = hasMeaningfulPlayNcDetailSnapshot(extractPlayNcDetailSnapshot(detail));
      if (hasData) {
        break;
      }
    }

    if (retry < 2) {
      await sleep(150 * (retry + 1));
    }
  }

  if (!detail) {
    throw new Error("plaync info empty");
  }

  const snapshot = extractPlayNcDetailSnapshot(detail);
  if (!hasMeaningfulPlayNcDetailSnapshot(snapshot)) {
    throw new Error("plaync info missing stats");
  }

  const resolvedDetail = {
    itemLevel: snapshot.itemLevel,
    combatPower: snapshot.combatPower,
    profileImageUrl: snapshot.profileImageUrl,
    classId: snapshot.classId,
    className: snapshot.className,
    classKey: snapshot.classKey,
    classIconUrl: snapshot.classIconUrl,
  };

  detailCache.set(cacheKey, {
    fetchedAt: Date.now(),
    detail: resolvedDetail,
  });

  return resolvedDetail;
}

async function enrichPlayNcCharacters(
  characters: CharacterSummary[],
  classMap: Map<number, ClassMeta>,
  limit = characters.length,
  options?: { forceRefresh?: boolean },
): Promise<CharacterSummary[]> {
  const base = [...characters];
  const target = base.slice(0, Math.max(0, limit));
  const byId = new Map(base.map((character) => [character.id, character]));

  for (let index = 0; index < target.length; index += DETAIL_BATCH_SIZE) {
    const batch = target.slice(index, index + DETAIL_BATCH_SIZE);

    const results = await Promise.all(
      batch.map(async (character) => {
        try {
          const detail = await fetchPlayNcCharacterDetail(character.characterId, character.serverId, options);
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

      entry.itemLevel = preferExistingPositiveValue(entry.itemLevel, item.detail.itemLevel);
      entry.combatPower = preferExistingPositiveValue(entry.combatPower, item.detail.combatPower);
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

  const missingStats = target.filter((character) => character.itemLevel <= 0 || character.combatPower <= 0);
  for (const character of missingStats) {
    try {
      const detail = await fetchPlayNcCharacterDetail(character.characterId, character.serverId, {
        forceRefresh: true,
      });
      const entry = byId.get(character.id);
      if (!entry) {
        continue;
      }

      entry.itemLevel = preferExistingPositiveValue(entry.itemLevel, detail.itemLevel);
      entry.combatPower = preferExistingPositiveValue(entry.combatPower, detail.combatPower);
      entry.profileImageUrl = detail.profileImageUrl ?? entry.profileImageUrl;
      entry.classId = detail.classId ?? entry.classId;
      entry.className = detail.className ?? entry.className;
      entry.classKey = detail.classKey ?? entry.classKey;
      entry.classIconUrl = detail.classIconUrl ?? entry.classIconUrl;
    } catch {
      // Ignore and return the best effort result.
    }
  }

  return base;
}

async function enrichMissingStatsFromPlayNcDetail(
  characters: CharacterSummary[],
  classMap: Map<number, ClassMeta>,
  options?: { forceRefresh?: boolean },
): Promise<CharacterSummary[]> {
  const base = [...characters];
  const byId = new Map(base.map((character) => [character.id, character]));
  const target = base
    .filter((character) => character.itemLevel <= 0 || character.combatPower <= 0)
    .slice(0, DEFAULT_PAGE_SIZE);

  for (let index = 0; index < target.length; index += DETAIL_BATCH_SIZE) {
    const batch = target.slice(index, index + DETAIL_BATCH_SIZE);

    const results = await Promise.all(
      batch.map(async (character) => {
        try {
          const detail = await fetchPlayNcCharacterDetail(character.characterId, character.serverId, options);
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

async function enrichMissingStatsFromA2Tool(characters: CharacterSummary[]): Promise<CharacterSummary[]> {
  const base = [...characters];
  const byId = new Map(base.map((character) => [character.id, character]));
  const target = base
    .filter(
      (character) =>
        character.itemLevel <= 0 ||
        character.combatPower <= 0 ||
        !toOptionalString(character.className),
    )
    .slice(0, A2TOOL_ENRICH_LIMIT);
  const cache = new Map<string, A2ToolCharacterSnapshot | null>();

  for (let index = 0; index < target.length; index += DETAIL_BATCH_SIZE) {
    const batch = target.slice(index, index + DETAIL_BATCH_SIZE);

    const results = await Promise.all(
      batch.map(async (character) => {
        const cacheKey = `${character.serverId}:${character.name}:${character.race ?? 0}`;
        if (cache.has(cacheKey)) {
          return { character, snapshot: cache.get(cacheKey) ?? null };
        }

        const snapshot = await fetchA2ToolCharacterSnapshot(
          character.name,
          character.serverId,
          inferRaceCandidates(character.race),
        );
        cache.set(cacheKey, snapshot);
        return { character, snapshot };
      }),
    );

    for (const item of results) {
      if (!item.snapshot) {
        continue;
      }

      const entry = byId.get(item.character.id);
      if (!entry) {
        continue;
      }

      if (entry.itemLevel <= 0 && item.snapshot.itemLevel > 0) {
        entry.itemLevel = item.snapshot.itemLevel;
      }
      if (entry.combatPower <= 0 && item.snapshot.combatPower > 0) {
        entry.combatPower = item.snapshot.combatPower;
      }
      if (!entry.className && item.snapshot.className) {
        entry.className = item.snapshot.className;
      }
      if (!entry.classKey && item.snapshot.classKey) {
        entry.classKey = item.snapshot.classKey;
      }
      if (!entry.classIconUrl && item.snapshot.classIconUrl) {
        entry.classIconUrl = item.snapshot.classIconUrl;
      }
    }
  }

  return base;
}

async function searchWithPlayNcApi(
  name: string,
  serverId?: number,
  size = DEFAULT_PAGE_SIZE,
  options?: { forceRefresh?: boolean },
) {
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

  return enrichPlayNcCharacters(mapped, classMap, size, options);
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
      const characterId = normalizeCharacterId(
        el.attr("data-character-id") || el.find("[data-character-id]").attr("data-character-id") || "",
      );

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
  const refreshRaw = request.nextUrl.searchParams.get("refresh")?.trim() ?? "";

  if (!name) {
    return NextResponse.json({ error: "name 파라미터가 필요합니다." }, { status: 400 });
  }

  const serverId = serverIdRaw ? toNumber(serverIdRaw, 0) || undefined : undefined;
  const size = Math.min(Math.max(toNumber(sizeRaw, DEFAULT_PAGE_SIZE), 1), DEFAULT_PAGE_SIZE);
  const forceRefresh = refreshRaw === "1" || refreshRaw.toLowerCase() === "true";

  const warnings: string[] = [];

  try {
    const playncApi = await searchWithPlayNcApi(name, serverId, size, { forceRefresh });
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
        enriched = await enrichMissingStatsFromPlayNcDetail(scraped, classMap, { forceRefresh });
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
