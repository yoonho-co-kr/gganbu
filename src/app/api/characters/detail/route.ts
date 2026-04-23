import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const preferredRegion = "icn1";

type UnknownRecord = Record<string, unknown>;

type EquipmentItem = {
  id: number;
  name: string;
  grade: string;
  enchantLevel: number;
  exceedLevel: number;
  slotPos: number;
  slotPosName: string;
  icon: string | null;
};

type CharacterSkill = {
  id: number;
  name: string;
  needLevel: number;
  category: string;
  skillLevel: number;
  targetLevel: number;
  acquired: number;
  equip: number;
  icon: string | null;
};

type RankerSkillStat = {
  name: string;
  pickRate: number;
  highTierCount: number;
  totalUsers: number;
};

type RankerSkillStatsByCategory = {
  active: RankerSkillStat[];
  passive: RankerSkillStat[];
  stigma: RankerSkillStat[];
};

type A2ToolSkillStatsPayload = {
  success?: boolean;
  data?: {
    active?: UnknownRecord[];
    passive?: UnknownRecord[];
    stigma?: UnknownRecord[];
  };
};

type PlayNcSearchPayload = {
  list?: UnknownRecord[];
};

type PlayNcSearchSummary = {
  characterId: string;
  name: string;
  serverId: number;
  serverName: string;
  className: string;
  raceName: string;
  itemLevel: number;
  combatPower: number;
};

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

function toOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
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

function normalizeSkillName(value: string): string {
  return value.toLowerCase().replace(/[\s·ㆍ\-_]/g, "");
}

function normalizeCharacterNameForMatch(value: string): string {
  return value.replace(/<[^>]+>/g, "").replace(/\s+/g, "").toLowerCase();
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

function raceIdToName(raceId: number): string {
  if (raceId === 1) {
    return "천족";
  }
  if (raceId === 2) {
    return "마족";
  }
  return "";
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

async function fetchJson<T>(url: string, timeoutMs = 8000, headers?: HeadersInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        accept: "application/json, text/plain, */*",
        "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        ...(headers ?? {}),
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

function mapRankerSkillList(list: unknown): RankerSkillStat[] {
  return asArray(list)
    .map((entry) => asRecord(entry))
    .filter((entry): entry is UnknownRecord => Boolean(entry))
    .map((entry) => ({
      name: String(entry.name ?? "").trim(),
      pickRate: toNumber(entry.pick_rate ?? entry.total_pick_rate, 0),
      highTierCount: toNumber(entry.high_tier_count, 0),
      totalUsers: toNumber(entry.total_users, 0),
    }))
    .filter((entry) => entry.name.length > 0 && (entry.pickRate > 0 || entry.highTierCount > 0))
    .sort((a, b) => {
      if (b.pickRate !== a.pickRate) {
        return b.pickRate - a.pickRate;
      }
      return b.highTierCount - a.highTierCount;
    });
}

async function fetchA2ToolSkillStats(jobName: string): Promise<RankerSkillStatsByCategory | null> {
  if (!jobName.trim()) {
    return null;
  }

  const encoded = encodeURIComponent(jobName);
  const payload = await fetchJson<A2ToolSkillStatsPayload>(
    `https://aion2tool.com/api/stats/skills?job=${encoded}`,
    10_000,
    {
      origin: "https://aion2tool.com",
      referer: "https://aion2tool.com/statistics/skill",
    },
  );

  if (!payload.success || !payload.data) {
    return null;
  }

  return {
    active: mapRankerSkillList(payload.data.active),
    passive: mapRankerSkillList(payload.data.passive),
    stigma: mapRankerSkillList(payload.data.stigma),
  };
}

async function resolveCharacterIdByName(name: string, serverId: number): Promise<string | null> {
  if (!name.trim()) {
    return null;
  }

  const params = new URLSearchParams({
    keyword: name,
    page: "0",
    size: "20",
    serverId: String(serverId),
  });

  const payload = await fetchJson<PlayNcSearchPayload>(
    `https://aion2.plaync.com/ko-kr/api/search/aion2/search/v2/character?${params.toString()}`,
    10_000,
  );

  const list = asArray(payload.list)
    .map((entry) => asRecord(entry))
    .filter((entry): entry is UnknownRecord => Boolean(entry))
    .map((entry) => ({
      characterId: normalizeCharacterId(entry.characterId),
      serverId: toNumber(entry.serverId, 0),
      name: String(entry.name ?? "").trim(),
    }))
    .filter((entry) => entry.characterId.length > 0 && entry.serverId > 0);

  if (list.length === 0) {
    return null;
  }

  const normalizedTargetName = normalizeCharacterNameForMatch(name);
  const exact = list.find(
    (entry) =>
      entry.serverId === serverId &&
      normalizeCharacterNameForMatch(entry.name) === normalizedTargetName,
  );
  return exact?.characterId ?? list.find((entry) => entry.serverId === serverId)?.characterId ?? list[0]?.characterId ?? null;
}

async function fetchPlayNcSearchSummaryByName(name: string, serverId: number): Promise<PlayNcSearchSummary | null> {
  if (!name.trim()) {
    return null;
  }

  const params = new URLSearchParams({
    keyword: name,
    page: "0",
    size: "20",
    serverId: String(serverId),
  });

  const payload = await fetchJson<PlayNcSearchPayload>(
    `https://aion2.plaync.com/ko-kr/api/search/aion2/search/v2/character?${params.toString()}`,
    10_000,
  );

  const list = asArray(payload.list)
    .map((entry) => asRecord(entry))
    .filter((entry): entry is UnknownRecord => Boolean(entry))
    .map((entry) => ({
      characterId: normalizeCharacterId(entry.characterId),
      name: String(entry.name ?? "").replace(/<[^>]+>/g, "").trim(),
      serverId: toNumber(entry.serverId),
      serverName: String(entry.serverName ?? "").trim(),
      className: String(entry.classText ?? entry.className ?? "").trim(),
      raceName: raceIdToName(toNumber(entry.race)),
      itemLevel: pickPositiveNumberFromValues([
        entry.itemLevel,
        entry.totalItemLevel,
        entry.itemLv,
        entry.item_level,
      ]),
      combatPower: pickPositiveNumberFromValues([
        entry.combatPower,
        entry.maxCombatPower,
        entry.battlePower,
        entry.totalCombatPower,
        entry.cp,
      ]),
    }))
    .filter((entry) => entry.characterId && entry.name && entry.serverId > 0);

  if (list.length === 0) {
    return null;
  }

  const normalizedTargetName = normalizeCharacterNameForMatch(name);
  return (
    list.find(
      (entry) =>
        entry.serverId === serverId &&
        normalizeCharacterNameForMatch(entry.name) === normalizedTargetName,
    ) ??
    list.find((entry) => entry.serverId === serverId) ??
    list[0] ??
    null
  );
}

function hasMeaningfulDetailPayload(infoPayload: UnknownRecord, equipmentPayload: UnknownRecord): boolean {
  const profile = asRecord(infoPayload.profile) ?? {};
  const stat = asRecord(infoPayload.stat) ?? {};
  const statList = asArray(stat.statList);
  const equipmentRoot = asRecord(equipmentPayload.equipment) ?? {};
  const skillRoot = asRecord(equipmentPayload.skill) ?? {};
  const equipmentList = asArray(equipmentRoot.equipmentList);
  const skillList = asArray(skillRoot.skillList);

  return Boolean(
    toOptionalString(profile.characterName) ||
      toNumber(profile.combatPower, 0) > 0 ||
      statList.length > 0 ||
      equipmentList.length > 0 ||
      skillList.length > 0,
  );
}

function mapEquipmentList(list: unknown): EquipmentItem[] {
  if (!Array.isArray(list)) {
    return [];
  }

  return list
    .map((item) => asRecord(item))
    .filter((item): item is UnknownRecord => Boolean(item))
    .map((item) => ({
      id: toNumber(item.id),
      name: String(item.name ?? "").trim(),
      grade: String(item.grade ?? "").trim(),
      enchantLevel: toNumber(item.enchantLevel),
      exceedLevel: toNumber(item.exceedLevel),
      slotPos: toNumber(item.slotPos),
      slotPosName: String(item.slotPosName ?? "").trim(),
      icon: toOptionalString(item.icon) ?? null,
    }))
    .filter((item) => item.id > 0 && item.name.length > 0);
}

function pickItemLevel(statList: UnknownRecord[], profile: UnknownRecord): number {
  const itemLevelStat = statList.find((entry) => String(entry.name ?? "").includes("아이템레벨"));
  return toNumber(itemLevelStat?.value, toNumber(profile.itemLevel, 0));
}

function pickCombatPower(profile: UnknownRecord): number {
  return toNumber(
    profile.combatPower ?? profile.maxCombatPower ?? profile.battlePower ?? profile.cp,
    0,
  );
}

function mapSkillList(list: unknown): CharacterSkill[] {
  if (!Array.isArray(list)) {
    return [];
  }

  return list
    .map((entry) => asRecord(entry))
    .filter((entry): entry is UnknownRecord => Boolean(entry))
    .map((entry) => ({
      id: toNumber(entry.id, 0),
      name: String(entry.name ?? "").trim(),
      needLevel: toNumber(entry.needLevel, 0),
      category: String(entry.category ?? "").trim(),
      skillLevel: toNumber(entry.skillLevel, 0),
      targetLevel: 0,
      acquired: toNumber(entry.acquired, 0),
      equip: toNumber(entry.equip, 0),
      icon: toOptionalString(entry.icon) ?? null,
    }))
    .filter((entry) => entry.skillLevel >= 0 && entry.name.length > 0);
}

function pickSkillEntries(
  skills: CharacterSkill[],
  category: "active" | "passive" | "stigma",
): CharacterSkill[] {
  return skills
    .filter((skill) => {
      const normalized = skill.category.toLowerCase();
      const isActive = normalized === "active";
      const isPassive = normalized === "passive";
      const isStigmaCategory = normalized === "dp";

      const categoryMatched =
        (category === "active" && isActive) ||
        (category === "passive" && isPassive) ||
        (category === "stigma" && isStigmaCategory);

      return categoryMatched && skill.acquired > 0 && skill.skillLevel > 0;
    })
    .sort((a, b) => {
      if (b.skillLevel !== a.skillLevel) {
        return b.skillLevel - a.skillLevel;
      }
      if (b.needLevel !== a.needLevel) {
        return b.needLevel - a.needLevel;
      }
      return a.name.localeCompare(b.name, "ko");
    });
}

function pickHighInvestmentSkillNames(stats: RankerSkillStat[]): Set<string> {
  if (stats.length === 0) {
    return new Set<string>();
  }

  const topPickRate = stats[0]?.pickRate ?? 0;
  const topHighTier = stats[0]?.highTierCount ?? 0;
  const pickRateThreshold = Math.max(10, topPickRate * 0.5);
  const highTierThreshold = Math.max(8, Math.floor(topHighTier * 0.45));

  const selected = stats
    .filter((entry) => entry.pickRate >= pickRateThreshold || entry.highTierCount >= highTierThreshold)
    .slice(0, 6);

  return new Set(selected.map((entry) => normalizeSkillName(entry.name)));
}

function applySkillTargets(
  skills: CharacterSkill[],
  category: "active" | "passive" | "stigma",
  highInvestmentSkillNames: Set<string>,
): CharacterSkill[] {
  const groupMax = skills.reduce((max, skill) => Math.max(max, skill.skillLevel), 0);
  const groupTarget = category === "active" ? 20 : Math.max(1, groupMax);

  return skills.map((skill) => {
    const isRecommended = highInvestmentSkillNames.has(normalizeSkillName(skill.name));
    const targetLevel = isRecommended ? Math.max(skill.skillLevel, groupTarget) : skill.skillLevel;
    return {
      ...skill,
      targetLevel,
    };
  });
}

export async function GET(request: NextRequest) {
  const characterIdRaw = request.nextUrl.searchParams.get("characterId")?.trim() ?? "";
  const serverIdRaw = request.nextUrl.searchParams.get("serverId")?.trim() ?? "";
  const characterNameRaw = request.nextUrl.searchParams.get("name")?.trim() ?? "";

  if (!characterIdRaw || !serverIdRaw) {
    return NextResponse.json({ error: "characterId, serverId 파라미터가 필요합니다." }, { status: 400 });
  }

  const serverId = toNumber(serverIdRaw, 0);
  if (!serverId) {
    return NextResponse.json({ error: "유효하지 않은 serverId 입니다." }, { status: 400 });
  }

  const characterId = normalizeCharacterId(characterIdRaw);

  try {
    const warnings: string[] = [];
    const fetchDetailPayload = async (targetCharacterId: string) => {
      const normalizedTargetCharacterId = normalizeCharacterId(targetCharacterId);
      const referer = `https://aion2.plaync.com/ko-kr/characters/${serverId}/${encodeURIComponent(normalizedTargetCharacterId)}`;
      const languages = ["ko-kr", "ko"];
      let fallbackPayload: { infoPayload: UnknownRecord; equipmentPayload: UnknownRecord } | null = null;
      let lastError: string | null = null;

      for (const lang of languages) {
        try {
          const params = new URLSearchParams({
            lang,
            characterId: normalizedTargetCharacterId,
            serverId: String(serverId),
          });

          const infoUrl = `https://aion2.plaync.com/api/character/info?${params.toString()}`;
          const equipmentUrl = `https://aion2.plaync.com/api/character/equipment?${params.toString()}`;

          const [infoPayload, equipmentPayload] = await Promise.all([
            fetchJson<UnknownRecord>(infoUrl, 10_000, {
              origin: "https://aion2.plaync.com",
              referer,
            }),
            fetchJson<UnknownRecord>(equipmentUrl, 10_000, {
              origin: "https://aion2.plaync.com",
              referer,
            }),
          ]);

          fallbackPayload = { infoPayload, equipmentPayload };
          if (hasMeaningfulDetailPayload(infoPayload, equipmentPayload)) {
            return fallbackPayload;
          }
        } catch (error) {
          lastError = error instanceof Error ? error.message : "unknown";
        }
      }

      if (fallbackPayload) {
        warnings.push("plaync detail empty payload");
        return fallbackPayload;
      }

      throw new Error(lastError ?? "plaync detail fetch failed");
    };

    let resolvedCharacterId = characterId;
    let detailPayload: { infoPayload: UnknownRecord; equipmentPayload: UnknownRecord };

    try {
      detailPayload = await fetchDetailPayload(resolvedCharacterId);
    } catch (firstError) {
      if (!characterNameRaw) {
        throw firstError;
      }

      const resolvedByName = await resolveCharacterIdByName(characterNameRaw, serverId);
      if (!resolvedByName) {
        throw firstError;
      }

      const normalizedResolvedByName = normalizeCharacterId(resolvedByName);

      if (normalizedResolvedByName === resolvedCharacterId) {
        throw firstError;
      }

      detailPayload = await fetchDetailPayload(normalizedResolvedByName);
      resolvedCharacterId = normalizedResolvedByName;
      warnings.push("characterId fallback by name");
    }

    const { infoPayload, equipmentPayload } = detailPayload;

    const profile = asRecord(infoPayload.profile) ?? {};
    const stat = asRecord(infoPayload.stat) ?? {};
    const statList =
      ((stat.statList as UnknownRecord[] | undefined) ?? []).filter((entry): entry is UnknownRecord => Boolean(entry));

    const equipmentRoot = asRecord(equipmentPayload.equipment) ?? {};
    const skillRoot = asRecord(equipmentPayload.skill) ?? {};
    const skillList = mapSkillList(skillRoot.skillList);
    const summaryFallback =
      hasMeaningfulDetailPayload(infoPayload, equipmentPayload) || !characterNameRaw
        ? null
        : await fetchPlayNcSearchSummaryByName(characterNameRaw, serverId).catch(() => null);
    if (summaryFallback) {
      warnings.push("plaync summary fallback applied");
    }

    const className = toOptionalString(profile.className) ?? summaryFallback?.className ?? "";

    const activeSkillsRaw = pickSkillEntries(skillList, "active");
    const passiveSkillsRaw = pickSkillEntries(skillList, "passive");
    const stigmaSkillsRaw = pickSkillEntries(skillList, "stigma");

    let rankerStats: RankerSkillStatsByCategory | null = null;
    try {
      rankerStats = className ? await fetchA2ToolSkillStats(className) : null;
    } catch {
      rankerStats = null;
    }

    const activeRecommended =
      rankerStats && rankerStats.active.length > 0
        ? pickHighInvestmentSkillNames(rankerStats.active)
        : new Set<string>();
    const passiveRecommended =
      rankerStats && rankerStats.passive.length > 0
        ? pickHighInvestmentSkillNames(rankerStats.passive)
        : new Set<string>();
    const stigmaRecommended =
      rankerStats && rankerStats.stigma.length > 0
        ? pickHighInvestmentSkillNames(rankerStats.stigma)
        : new Set<string>();

    const activeSkills = applySkillTargets(activeSkillsRaw, "active", activeRecommended);
    const passiveSkills = applySkillTargets(passiveSkillsRaw, "passive", passiveRecommended);
    const stigmaSkills = applySkillTargets(stigmaSkillsRaw, "stigma", stigmaRecommended);

    return NextResponse.json({
      source: "plaync-api",
      profile: {
        characterId: toOptionalString(profile.characterId) ?? resolvedCharacterId,
        characterName: toOptionalString(profile.characterName) ?? summaryFallback?.name ?? "",
        serverId: toNumber(profile.serverId, serverId),
        serverName: toOptionalString(profile.serverName) ?? summaryFallback?.serverName ?? "",
        className,
        raceName: toOptionalString(profile.raceName) ?? summaryFallback?.raceName ?? "",
        regionName: toOptionalString(profile.regionName) ?? "",
        level: toNumber(profile.characterLevel, 0),
        profileImage: toOptionalString(profile.profileImage) ?? null,
        itemLevel: pickItemLevel(statList, profile) || summaryFallback?.itemLevel || 0,
        combatPower: pickCombatPower(profile) || summaryFallback?.combatPower || 0,
      },
      skills: {
        activeSkills,
        passiveSkills,
        stigmaSkills,
      },
      statList: statList.map((entry) => ({
        type: toOptionalString(entry.type) ?? "",
        name: toOptionalString(entry.name) ?? "",
        value: toNumber(entry.value),
      })),
      equipment: {
        equipmentList: mapEquipmentList(equipmentRoot.equipmentList),
        skinList: mapEquipmentList(equipmentRoot.skinList),
      },
      links: {
        plaync: `https://aion2.plaync.com/ko-kr/characters/${serverId}/${encodeURIComponent(resolvedCharacterId)}`,
        aon2: `https://aon2.info/character/${serverId}/${encodeURIComponent(resolvedCharacterId)}`,
      },
      warnings,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "캐릭터 상세 조회에 실패했습니다." },
      { status: 500 },
    );
  }
}
