import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

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
  acquired: number;
  equip: number;
  icon: string | null;
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

export async function GET(request: NextRequest) {
  const characterIdRaw = request.nextUrl.searchParams.get("characterId")?.trim() ?? "";
  const serverIdRaw = request.nextUrl.searchParams.get("serverId")?.trim() ?? "";

  if (!characterIdRaw || !serverIdRaw) {
    return NextResponse.json({ error: "characterId, serverId 파라미터가 필요합니다." }, { status: 400 });
  }

  const serverId = toNumber(serverIdRaw, 0);
  if (!serverId) {
    return NextResponse.json({ error: "유효하지 않은 serverId 입니다." }, { status: 400 });
  }

  let characterId = characterIdRaw;
  try {
    characterId = decodeURIComponent(characterIdRaw);
  } catch {
    characterId = characterIdRaw;
  }

  const params = new URLSearchParams({
    lang: "ko-kr",
    characterId,
    serverId: String(serverId),
  });

  const infoUrl = `https://aion2.plaync.com/api/character/info?${params.toString()}`;
  const equipmentUrl = `https://aion2.plaync.com/api/character/equipment?${params.toString()}`;

  try {
    const [infoPayload, equipmentPayload] = await Promise.all([
      fetchJson<UnknownRecord>(infoUrl),
      fetchJson<UnknownRecord>(equipmentUrl),
    ]);

    const profile = asRecord(infoPayload.profile) ?? {};
    const stat = asRecord(infoPayload.stat) ?? {};
    const statList =
      ((stat.statList as UnknownRecord[] | undefined) ?? []).filter((entry): entry is UnknownRecord => Boolean(entry));

    const equipmentRoot = asRecord(equipmentPayload.equipment) ?? {};
    const skillRoot = asRecord(equipmentPayload.skill) ?? {};
    const skillList = mapSkillList(skillRoot.skillList);
    const activeSkills = pickSkillEntries(skillList, "active");
    const passiveSkills = pickSkillEntries(skillList, "passive");
    const stigmaSkills = pickSkillEntries(skillList, "stigma");

    return NextResponse.json({
      source: "plaync-api",
      profile: {
        characterId: toOptionalString(profile.characterId) ?? characterIdRaw,
        characterName: toOptionalString(profile.characterName) ?? "",
        serverId: toNumber(profile.serverId, serverId),
        serverName: toOptionalString(profile.serverName) ?? "",
        className: toOptionalString(profile.className) ?? "",
        raceName: toOptionalString(profile.raceName) ?? "",
        regionName: toOptionalString(profile.regionName) ?? "",
        level: toNumber(profile.characterLevel, 0),
        profileImage: toOptionalString(profile.profileImage) ?? null,
        itemLevel: pickItemLevel(statList, profile),
        combatPower: pickCombatPower(profile),
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
        plaync: `https://aion2.plaync.com/ko-kr/characters/character-info?serverId=${serverId}&characterId=${encodeURIComponent(characterId)}`,
        aon2: `https://aon2.info/character/${serverId}/${encodeURIComponent(characterId)}`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "캐릭터 상세 조회에 실패했습니다." },
      { status: 500 },
    );
  }
}
