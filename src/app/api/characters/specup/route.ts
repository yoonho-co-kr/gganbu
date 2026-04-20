import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type UnknownRecord = Record<string, unknown>;

type CpTableEntry = {
  E300k: number;
  k: number;
};

const CP_STAT_TABLE: Record<string, CpTableEntry> = {
  "전투속도%": { E300k: 520, k: 1.0 },
  "PVE피해증폭%": { E300k: 340, k: 1.0 },
  "치명타피해증폭%": { E300k: 150, k: 1.0 },
  "보스피해증폭%": { E300k: 200, k: 1.0 },
  "다단히트적중%": { E300k: 150, k: 1.0 },
  "이동속도%": { E300k: 286, k: 0.1 },
  "피해증폭%": { E300k: 330, k: 1.0 },
  "재시전시간감소%": { E300k: 289, k: 0.1 },
  "재사용대기시간%": { E300k: 289, k: 0.1 },
  "강타%": { E300k: 500, k: 1.0 },
  "완벽%": { E300k: 100, k: 1.0 },
  "무기피해증폭%": { E300k: 283, k: 1.0 },
  "후방피해증폭%": { E300k: 151.5, k: 1.0 },
  "공격력%": { E300k: 907.5, k: 1.0 },
  "보스피해내성%": { E300k: 100, k: 0 },
  "치명타피해내성%": { E300k: 80, k: 0 },
  "피해내성%": { E300k: 160, k: 2.0 },
  "다단히트저항%": { E300k: 17, k: 0 },
  "무기피해내성%": { E300k: 160, k: 0.6 },
  "철벽%": { E300k: 50, k: 0 },
  정확: { E300k: 9.35, k: 1.0 },
  위력: { E300k: 90.75, k: 0.2 },
  보스공격력: { E300k: 12, k: 0.5 },
  명중: { E300k: 7.7, k: -1.3 },
  추가명중: { E300k: 7.7, k: -1.3 },
  공격력: { E300k: 50, k: -1.3 },
  추가공격력: { E300k: 50, k: -1.3 },
  치명타: { E300k: 8.2, k: 0 },
  PVE공격력: { E300k: 20, k: 0.5 },
  PVE명중: { E300k: 4.06, k: -1.3 },
  방어력: { E300k: 1, k: 0 },
  추가방어력: { E300k: 1, k: 0 },
  "방어력%": { E300k: 100, k: 0 },
  정신력: { E300k: 0.5, k: 0 },
  생명력: { E300k: 0.125, k: 0 },
};

const STAT_RULES: Array<[RegExp, string | null]> = [
  [/^PVE피해증폭/, "PVE피해증폭%"],
  [/^PVE공격력/, "PVE공격력"],
  [/^PVE명중/, "PVE명중"],
  [/^보스피해증폭/, "보스피해증폭%"],
  [/^보스피해내성/, "보스피해내성%"],
  [/^보스공격력/, "보스공격력"],
  [/^치명타피해증폭/, "치명타피해증폭%"],
  [/^치명타피해내성/, "치명타피해내성%"],
  [/^무기피해증폭/, "무기피해증폭%"],
  [/^무기피해내성/, "무기피해내성%"],
  [/^후방피해증폭/, "후방피해증폭%"],
  [/^다단히트적중/, "다단히트적중%"],
  [/^다단히트저항/, "다단히트저항%"],
  [/^추가공격력/, "추가공격력"],
  [/^추가명중/, "추가명중"],
  [/^추가방어력/, "추가방어력"],
  [/^방어력증가/, "방어력%"],
  [/^방어력\(/, "방어력%"],
  [/^공격력증가/, "공격력%"],
  [/^피해증폭/, "피해증폭%"],
  [/^피해내성/, "피해내성%"],
  [/^전투속도/, "전투속도%"],
  [/^이동속도/, "이동속도%"],
  [/^재시전시간감소/, "재시전시간감소%"],
  [/^재사용대기시간/, "재사용대기시간%"],
  [/^강타/, "강타%"],
  [/^완벽/, "완벽%"],
  [/^철벽/, "철벽%"],
  [/^공격력/, "공격력"],
  [/^방어력/, "방어력"],
  [/^명중/, "명중"],
  [/^정확/, "정확"],
  [/^위력/, "위력"],
  [/^치명타저항/, null],
  [/^치명타/, "치명타"],
  [/^생명력/, "생명력"],
  [/^정신력/, "정신력"],
  [/^PVP/, null],
  [/^막기/, null],
  [/^회피/, null],
  [/^추가회피/, null],
  [/^추가희피/, null],
  [/^PVE傷害增幅/, "PVE피해증폭%"],
  [/^PVE攻擊力/, "PVE공격력"],
  [/^PVE命中/, "PVE명중"],
  [/^BOSS傷害增幅/, "보스피해증폭%"],
  [/^BOSS傷害防禦/, "보스피해내성%"],
  [/^BOSS攻擊力/, "보스공격력"],
  [/^首領傷害增幅/, "보스피해증폭%"],
  [/^首領傷害抗性/, "보스피해내성%"],
  [/^首領攻擊力/, "보스공격력"],
  [/^暴擊傷害增幅/, "치명타피해증폭%"],
  [/^暴擊傷害防禦/, "치명타피해내성%"],
  [/^暴擊傷害抗性/, "치명타피해내성%"],
  [/^武器傷害增幅/, "무기피해증폭%"],
  [/^武器傷害防禦/, "무기피해내성%"],
  [/^武器傷害抗性/, "무기피해내성%"],
  [/^後方傷害增幅/, "후방피해증폭%"],
  [/^背後傷害增幅/, "후방피해증폭%"],
  [/^多段打擊擊中/, "다단히트적중%"],
  [/^多段命中/, "다단히트적중%"],
  [/^多段打擊抵抗/, "다단히트저항%"],
  [/^多段抗性/, "다단히트저항%"],
  [/^額外攻擊力/, "추가공격력"],
  [/^額外命中/, "추가명중"],
  [/^額外防禦力/, "추가방어력"],
  [/^防禦力增加/, "방어력%"],
  [/^攻擊力增加/, "공격력%"],
  [/^傷害增幅/, "피해증폭%"],
  [/^傷害防禦/, "피해내성%"],
  [/^戰鬥速度/, "전투속도%"],
  [/^移動速度/, "이동속도%"],
  [/^再施放時間減少/, "재시전시간감소%"],
  [/^技能冷卻時間/, "재사용대기시간%"],
  [/^強襲/, "강타%"],
  [/^完美/, "완벽%"],
  [/^鐵壁/, "철벽%"],
  [/^攻擊力/, "공격력"],
  [/^防禦力/, "방어력"],
  [/^命中/, "명중"],
  [/^命中力/, "명중"],
  [/^精準/, "정확"],
  [/^威力/, "위력"],
  [/^暴擊抵抗/, null],
  [/^暴擊/, "치명타"],
  [/^生命力/, "생명력"],
  [/^精神力/, "정신력"],
  [/^格擋/, null],
  [/^迴避/, null],
  [/^額外迴避/, null],
];

function asRecord(value: unknown): UnknownRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  return value as UnknownRecord;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function toText(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/[,%\s]/g, ""));
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function parseNumericValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== "string") {
    return 0;
  }
  const parsed = Number.parseFloat(value.replace(/[^0-9.+-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeSkillName(value: string) {
  return value.toLowerCase().replace(/\s+/g, "");
}

function inferRaceCode(raceName: string): 1 | 2 | null {
  if (raceName.includes("천") || raceName.includes("天")) {
    return 1;
  }
  if (raceName.includes("마") || raceName.includes("魔")) {
    return 2;
  }
  return null;
}

function statNameToCpKey(rawName: string): string | null {
  const normalized = rawName.replace(/\s+/g, "");
  for (const [rule, cpKey] of STAT_RULES) {
    if (rule.test(normalized)) {
      return cpKey;
    }
  }
  return null;
}

function calculateCpChange(currentCp: number, statName: string, changeAmount: number): number {
  if (changeAmount === 0) {
    return 0;
  }
  const key = statName.replace(/\s+/g, "");
  const entry = CP_STAT_TABLE[key];
  if (!entry) {
    return 0;
  }
  const effective = entry.E300k * Math.pow(currentCp / 300_000, entry.k);
  return effective * changeAmount;
}

function normalizeMagicStoneStats(raw: unknown): Array<{ name: string; value: string }> {
  if (!raw) {
    return [];
  }

  if (Array.isArray(raw)) {
    return raw
      .map((entry) => asRecord(entry))
      .filter((entry): entry is UnknownRecord => entry !== null)
      .map((entry) => ({
        name: toText(entry.name) || toText(entry.label) || toText(entry.id),
        value: toText(entry.value),
      }))
      .filter((entry) => entry.name.length > 0);
  }

  const record = asRecord(raw);
  if (!record) {
    return [];
  }

  return Object.entries(record)
    .map(([name, value]) => ({
      name,
      value: String(value ?? "").trim(),
    }))
    .filter((entry) => entry.name.length > 0);
}

async function fetchA2ToolJson<T>(url: string, init: RequestInit, timeoutMs = 10_000): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      cache: "no-store",
      signal: controller.signal,
    });
    const text = await response.text();

    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(`JSON 파싱 실패 (${response.status})`);
    }

    if (!response.ok) {
      const payload = asRecord(parsed);
      throw new Error(toText(payload?.error) || `HTTP ${response.status}`);
    }

    return parsed as T;
  } finally {
    clearTimeout(timeout);
  }
}

type A2ToolSearchPayload = {
  success?: boolean;
  error?: string;
  data?: UnknownRecord;
};

async function fetchA2ToolSearch(name: string, serverId: number, race: 1 | 2) {
  const referer = `https://aion2tool.com/char/serverid=${serverId}/${encodeURIComponent(name)}`;
  const payload = await fetchA2ToolJson<A2ToolSearchPayload>(
    "https://aion2tool.com/api/character/search",
    {
      method: "POST",
      headers: {
        accept: "application/json, text/plain, */*",
        "content-type": "application/json",
        origin: "https://aion2tool.com",
        referer,
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      },
      body: JSON.stringify({
        race,
        server_id: serverId,
        keyword: name,
      }),
    },
    12_000,
  );

  if (payload.success && payload.data) {
    return payload.data;
  }
  return null;
}

type A2ToolItem = {
  name: string;
  iconUrl: string | null;
  categoryName: string;
  grade: string;
  enhanceLevel: number;
  exceedLevel: number;
  soulBindRate: number;
  slotPosName: string;
  isAccessory: boolean;
  magicStoneStats: Array<{ name: string; value: string }>;
};

function mapItem(raw: unknown): A2ToolItem | null {
  const record = asRecord(raw);
  if (!record) {
    return null;
  }
  const name = toText(record.name);
  if (!name) {
    return null;
  }
  return {
    name,
    iconUrl: toText(record.icon_url) || null,
    categoryName: toText(record.category_name),
    grade: toText(record.grade),
    enhanceLevel: toNumber(record.enhance_level, 0),
    exceedLevel: toNumber(record.exceed_level, 0),
    soulBindRate: toNumber(record.soul_bind_rate, 0),
    slotPosName: toText(record.slot_pos_name),
    isAccessory: Boolean(record.is_accessory),
    magicStoneStats: normalizeMagicStoneStats(record.magic_stone_stat),
  };
}

function isBreakthroughExcluded(item: A2ToolItem) {
  const source = `${item.slotPosName} ${item.categoryName} ${item.name}`.toLowerCase();

  if (["룬", "아뮬렛", "허리띠", "符文", "護身符", "古文石", "腰帶"].some((keyword) => source.includes(keyword.toLowerCase()))) {
    return true;
  }

  if (source.includes("arcana") || source.includes("아르카나")) {
    return true;
  }

  return false;
}

function isArcanaItem(item: A2ToolItem) {
  const source = `${item.slotPosName} ${item.categoryName} ${item.name}`.toLowerCase();
  return source.includes("arcana") || source.includes("아르카나");
}

function getBreakthroughCpCategory(item: A2ToolItem) {
  if (item.isAccessory) {
    return "accessory";
  }

  if (["Helmet", "Shoulder", "Torso", "Pants", "Gloves", "Boots", "Cape"].includes(item.slotPosName)) {
    return "armor";
  }

  if (["투구", "견갑", "상의", "하의", "장갑", "신발", "망토", "頭盔", "肩甲", "胸甲", "護腿", "手套", "靴", "披風"].some((k) => item.name.includes(k))) {
    return "armor";
  }

  return "weapon";
}

function getBreakthroughApiCategory(item: A2ToolItem): string | null {
  const source = `${item.slotPosName} ${item.categoryName} ${item.name}`;

  if (item.isAccessory) {
    if (/Bracelet|팔찌/.test(source)) return "팔찌";
    if (/Necklace|목걸이/.test(source)) return "목걸이";
    if (/Earring|귀걸이/.test(source)) return "귀걸이";
    if (/Ring|반지/.test(source)) return "반지";
    return null;
  }

  if (/SubHand|가더|盾/.test(source)) {
    return "가더";
  }

  const armorBySlot: Record<string, string> = {
    Torso: "상의",
    Pants: "하의",
    Boots: "신발",
    Helmet: "투구",
    Shoulder: "견갑",
    Gloves: "장갑",
    Cape: "망토",
  };
  if (armorBySlot[item.slotPosName]) {
    return armorBySlot[item.slotPosName];
  }

  const armorByName: Array<[RegExp, string]> = [
    [/(흉갑|胸甲)/, "상의"],
    [/(각반|脛甲|護腿)/, "하의"],
    [/(장화|靴|靴子)/, "신발"],
    [/(투구|頭盔|頭甲)/, "투구"],
    [/(견갑|肩甲)/, "견갑"],
    [/(장갑|手套)/, "장갑"],
    [/(망토|披風|斗篷)/, "망토"],
  ];
  for (const [pattern, category] of armorByName) {
    if (pattern.test(source)) {
      return category;
    }
  }

  const weaponMap: Array<[RegExp, string]> = [
    [/(대검|巨劍)/, "대검"],
    [/(단검|短刀)/, "단검"],
    [/(장검|長劍)/, "장검"],
    [/(활|弓)/, "활"],
    [/(전곤|戰棍)/, "전곤"],
    [/(법봉|法杖)/, "법봉"],
    [/(법서|法書)/, "법서"],
    [/(보주|寶珠)/, "보주"],
  ];
  for (const [pattern, category] of weaponMap) {
    if (pattern.test(source)) {
      return category;
    }
  }

  return null;
}

function getBreakthroughApiGrade(grade: string) {
  const normalized = grade.toLowerCase().trim();
  if (normalized === "epic" || normalized === "영웅") {
    return "영웅";
  }
  return "유일";
}

async function fetchBreakthroughExpectedKina(
  category: string | null,
  grade: string,
  startLevel: number,
  referer: string,
): Promise<number | null> {
  if (!category) {
    return null;
  }

  const body = {
    category,
    grade,
    start_level: startLevel,
    target_level: startLevel + 1,
  };

  const call = async (targetGrade: string) => {
    const payload = await fetchA2ToolJson<UnknownRecord>(
      "https://aion2tool.com/api/breakthrough/calculate",
      {
        method: "POST",
        headers: {
          accept: "application/json, text/plain, */*",
          "content-type": "application/json",
          origin: "https://aion2tool.com",
          referer,
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        },
        body: JSON.stringify({
          ...body,
          grade: targetGrade,
        }),
      },
      10_000,
    );

    if (payload.success !== true) {
      return null;
    }
    const summary = asRecord(payload.summary);
    return summary ? toNumber(summary.total_expected_kinah, 0) || null : null;
  };

  try {
    const primary = await call(grade);
    if (primary !== null) {
      return primary;
    }
    if (grade === "영웅") {
      return await call("유일");
    }
    return null;
  } catch {
    if (grade === "영웅") {
      try {
        return await call("유일");
      } catch {
        return null;
      }
    }
    return null;
  }
}

type A2ToolSkillStatsPayload = {
  success?: boolean;
  data?: {
    passive?: UnknownRecord[];
  };
};

async function fetchA2ToolPassiveSkillStats(jobName: string) {
  const encoded = encodeURIComponent(jobName);
  const payload = await fetchA2ToolJson<A2ToolSkillStatsPayload>(
    `https://aion2tool.com/api/stats/skills?job=${encoded}`,
    {
      method: "GET",
      headers: {
        accept: "application/json, text/plain, */*",
        origin: "https://aion2tool.com",
        referer: "https://aion2tool.com/statistics/skill",
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      },
    },
    10_000,
  );

  if (!payload.success || !payload.data) {
    return [];
  }

  return asArray(payload.data.passive)
    .map((entry) => asRecord(entry))
    .filter((entry): entry is UnknownRecord => entry !== null)
    .map((entry) => ({
      name: toText(entry.name),
      pickRate: parseNumericValue(entry.pick_rate ?? entry.total_pick_rate),
      highTierCount: toNumber(entry.high_tier_count, 0),
    }))
    .filter((entry) => entry.name.length > 0 && entry.pickRate > 0)
    .sort((a, b) => {
      if (b.pickRate !== a.pickRate) {
        return b.pickRate - a.pickRate;
      }
      return b.highTierCount - a.highTierCount;
    });
}

function pickItemLevel(data: UnknownRecord) {
  const stat = asRecord(data.stat);
  const list = stat ? asArray(stat.statList) : [];

  for (const entry of list) {
    const record = asRecord(entry);
    if (!record) {
      continue;
    }
    const type = toText(record.type);
    const name = toText(record.name);
    if (type === "ItemLevel" || name.includes("아이템레벨")) {
      return toNumber(record.value, 0);
    }
  }
  return 0;
}

export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get("name")?.trim() ?? "";
  const serverIdRaw = request.nextUrl.searchParams.get("serverId")?.trim() ?? "";
  const raceName = request.nextUrl.searchParams.get("raceName")?.trim() ?? "";

  if (!name || !serverIdRaw) {
    return NextResponse.json({ error: "name, serverId 파라미터가 필요합니다." }, { status: 400 });
  }

  const serverId = toNumber(serverIdRaw, 0);
  if (!serverId) {
    return NextResponse.json({ error: "유효하지 않은 serverId 입니다." }, { status: 400 });
  }

  const raceCode = raceName ? inferRaceCode(raceName) : null;
  const raceCandidates: Array<1 | 2> = raceCode ? [raceCode] : [1, 2];
  const warnings: string[] = [];

  let resolvedData: UnknownRecord | null = null;
  let resolvedRace: 1 | 2 | null = null;
  for (const race of raceCandidates) {
    try {
      const result = await fetchA2ToolSearch(name, serverId, race);
      if (result) {
        resolvedData = result;
        resolvedRace = race;
        break;
      }
    } catch (error) {
      warnings.push(`race ${race} 조회 실패: ${error instanceof Error ? error.message : "unknown"}`);
    }
  }

  if (!resolvedData || !resolvedRace) {
    return NextResponse.json(
      {
        error: "A2Tool에서 캐릭터 스펙업 데이터를 찾지 못했습니다.",
        warnings,
      },
      { status: 404 },
    );
  }

  const referer = `https://aion2tool.com/char/serverid=${serverId}/${encodeURIComponent(name)}`;
  const equipment = asArray(resolvedData.equipment).map(mapItem).filter((item): item is A2ToolItem => item !== null);
  const accessories = asArray(resolvedData.accessories)
    .map(mapItem)
    .filter((item): item is A2ToolItem => item !== null);
  const allItems = [...equipment, ...accessories];

  const currentCp = toNumber(
    resolvedData.nc_combat_power ?? resolvedData.combat_power2 ?? resolvedData.combat_power,
    0,
  );

  const magicStoneItems = allItems
    .map((item) => {
      if (item.magicStoneStats.length === 0) {
        return null;
      }

      let total = 0;
      const stats = item.magicStoneStats.map((stat) => {
        const cpKey = statNameToCpKey(stat.name);
        let cpContrib = 0;
        if (cpKey) {
          let numeric = parseNumericValue(stat.value);
          if (cpKey.endsWith("%")) {
            numeric /= 100;
          }
          cpContrib = calculateCpChange(currentCp, cpKey, numeric);
        }
        total += cpContrib;
        return {
          name: stat.name,
          value: stat.value,
          cpContrib,
        };
      });

      return {
        itemName: item.name,
        iconUrl: item.iconUrl,
        totalCpContrib: total,
        engravingCount: stats.length,
        stats,
      };
    })
    .filter((item) => item !== null)
    .sort((a, b) => {
      const delta = a.totalCpContrib - b.totalCpContrib;
      if (Math.abs(delta) > 0.001) {
        return delta;
      }
      return a.itemName.localeCompare(b.itemName, "ko");
    })
    .map((item, index) => ({
      rank: index + 1,
      ...item,
    }));

  const breakthroughBaseItems = allItems
    .filter((item) => !isBreakthroughExcluded(item))
    .filter((item) => item.exceedLevel >= 0 && item.exceedLevel < 5)
    .map((item) => {
      const cpCategory = getBreakthroughCpCategory(item);
      const stats =
        cpCategory === "weapon"
          ? [
              {
                name: "공격력",
                change: "+30",
                cp: calculateCpChange(currentCp, "공격력", 30),
              },
              {
                name: "공격력 %",
                change: "+1%",
                cp: calculateCpChange(currentCp, "공격력%", 1),
              },
            ]
          : cpCategory === "accessory"
            ? [
                {
                  name: "공격력",
                  change: "+20",
                  cp: calculateCpChange(currentCp, "공격력", 20),
                },
                {
                  name: "방어력",
                  change: "+20",
                  cp: calculateCpChange(currentCp, "방어력", 20),
                },
                {
                  name: "공격력 %",
                  change: "+1%",
                  cp: calculateCpChange(currentCp, "공격력%", 1),
                },
              ]
            : [
                {
                  name: "방어력",
                  change: "+40",
                  cp: calculateCpChange(currentCp, "방어력", 40),
                },
                {
                  name: "생명력",
                  change: "+40",
                  cp: calculateCpChange(currentCp, "생명력", 40),
                },
                {
                  name: "방어력 %",
                  change: "+1%",
                  cp: calculateCpChange(currentCp, "방어력%", 1),
                },
              ];

      const cpGain = stats.reduce((sum, stat) => sum + stat.cp, 0);

      return {
        itemName: item.name,
        iconUrl: item.iconUrl,
        currentExceedLevel: item.exceedLevel,
        nextExceedLevel: item.exceedLevel + 1,
        cpGain,
        stats,
        btCategory: getBreakthroughApiCategory(item),
        btGrade: getBreakthroughApiGrade(item.grade),
      };
    });

  const breakthroughCache = new Map<string, number | null>();
  const breakthroughItemsRaw = await Promise.all(
    breakthroughBaseItems.map(async (item) => {
      const cacheKey = `${item.btCategory ?? "none"}:${item.btGrade}:${item.currentExceedLevel}`;
      let expectedKina: number | null = null;
      if (breakthroughCache.has(cacheKey)) {
        expectedKina = breakthroughCache.get(cacheKey) ?? null;
      } else {
        expectedKina = await fetchBreakthroughExpectedKina(item.btCategory, item.btGrade, item.currentExceedLevel, referer);
        breakthroughCache.set(cacheKey, expectedKina);
      }

      const cpPerMil = expectedKina && expectedKina > 0 ? (item.cpGain * 1_000_000) / expectedKina : null;

      return {
        ...item,
        expectedKina,
        cpPerMil,
      };
    }),
  );

  const breakthroughItems = breakthroughItemsRaw
    .sort((a, b) => {
      if (a.cpPerMil === null && b.cpPerMil === null) {
        return a.currentExceedLevel - b.currentExceedLevel;
      }
      if (a.cpPerMil === null) {
        return 1;
      }
      if (b.cpPerMil === null) {
        return -1;
      }
      const delta = b.cpPerMil - a.cpPerMil;
      if (Math.abs(delta) > 0.001) {
        return delta;
      }
      return a.currentExceedLevel - b.currentExceedLevel;
    })
    .map((item, index) => ({
      rank: index + 1,
      itemName: item.itemName,
      iconUrl: item.iconUrl,
      currentExceedLevel: item.currentExceedLevel,
      nextExceedLevel: item.nextExceedLevel,
      cpGain: item.cpGain,
      expectedKina: item.expectedKina,
      cpPerMil: item.cpPerMil,
      stats: item.stats,
    }));

  const otherRecommendations: Array<{
    key: string;
    title: string;
    reason: string;
    currentValue: string;
    targetValue: string;
    priority: "high" | "medium" | "low";
    examples: string[];
  }> = [];

  const lowEnchantItems = allItems
    .map((item) => ({
      item,
      targetEnhance: isArcanaItem(item) ? 5 : 15,
    }))
    .filter((entry) => entry.item.enhanceLevel >= 0 && entry.item.enhanceLevel < entry.targetEnhance)
    .sort((a, b) => {
      const gapDelta = b.targetEnhance - b.item.enhanceLevel - (a.targetEnhance - a.item.enhanceLevel);
      if (gapDelta !== 0) {
        return gapDelta;
      }
      return a.item.enhanceLevel - b.item.enhanceLevel;
    });
  if (lowEnchantItems.length > 0) {
    const minEnhance = lowEnchantItems.reduce((min, entry) => Math.min(min, entry.item.enhanceLevel), Number.POSITIVE_INFINITY);
    const arcanaLowCount = lowEnchantItems.filter((entry) => isArcanaItem(entry.item)).length;
    const normalLowCount = lowEnchantItems.length - arcanaLowCount;
    otherRecommendations.push({
      key: "enchant",
      title: "장비 강화",
      reason: `일반 +15 미만 ${normalLowCount}개, 아르카나 +5 미만 ${arcanaLowCount}개`,
      currentValue: `최저 +${Number.isFinite(minEnhance) ? minEnhance : 0}`,
      targetValue: "일반 +15 / 아르카나 +5 권장",
      priority: lowEnchantItems.some((entry) => (!isArcanaItem(entry.item) && entry.item.enhanceLevel <= 10) || (isArcanaItem(entry.item) && entry.item.enhanceLevel <= 2))
        ? "high"
        : "medium",
      examples: lowEnchantItems
        .slice(0, 3)
        .map((entry) => `${entry.item.name} (+${entry.item.enhanceLevel}/${entry.targetEnhance})`),
    });
  }

  const lowSoulBindItems = allItems
    .filter((item) => item.soulBindRate > 0 && item.soulBindRate < 100)
    .sort((a, b) => a.soulBindRate - b.soulBindRate);
  if (lowSoulBindItems.length > 0) {
    const minRate = lowSoulBindItems[0]?.soulBindRate ?? 0;
    otherRecommendations.push({
      key: "soul-bind",
      title: "영혼 각인율",
      reason: `100% 미만 장비 ${lowSoulBindItems.length}개`,
      currentValue: `최저 ${minRate.toFixed(1)}%`,
      targetValue: "100% 권장",
      priority: minRate < 80 ? "high" : "medium",
      examples: lowSoulBindItems.slice(0, 3).map((item) => `${item.name} (${item.soulBindRate.toFixed(1)}%)`),
    });
  }

  const parsedSkills = asArray(resolvedData.skills)
    .map((entry) => asRecord(entry))
    .filter((entry): entry is UnknownRecord => entry !== null)
    .map((entry) => ({
      name: toText(entry.name),
      group: toText(entry.group),
      category: toText(entry.category),
      level: toNumber(entry.level_int ?? entry.level, 0),
    }))
    .filter((entry) => entry.name.length > 0 && entry.level > 0);
  if (parsedSkills.length > 0) {
    const activeSkills = parsedSkills.filter((entry) => {
      const normalized = `${entry.group} ${entry.category}`.toLowerCase();
      return normalized.includes("active") || normalized.includes("액티브");
    });
    const lowActiveSkills = activeSkills.filter((entry) => entry.level < 20).sort((a, b) => a.level - b.level);
    if (lowActiveSkills.length > 0) {
      const minSkill = lowActiveSkills[0]?.level ?? 20;
      otherRecommendations.push({
        key: "active-skill-level",
        title: "액티브 스킬 레벨",
        reason: `Lv.20 미만 액티브 ${lowActiveSkills.length}개`,
        currentValue: `최저 Lv.${minSkill}`,
        targetValue: "Lv.20 권장",
        priority: minSkill <= 14 ? "high" : "medium",
        examples: lowActiveSkills.slice(0, 3).map((entry) => `${entry.name} (Lv.${entry.level})`),
      });
    }

    const passiveSkills = parsedSkills.filter((entry) => {
      const normalized = `${entry.group} ${entry.category}`.toLowerCase();
      return normalized.includes("passive") || normalized.includes("패시브");
    });

    if (passiveSkills.length > 0) {
      const passiveByName = new Map(passiveSkills.map((entry) => [normalizeSkillName(entry.name), entry]));
      const jobName = toText(resolvedData.job);
      let passiveRankStats: Array<{ name: string; pickRate: number; highTierCount: number }> = [];

      if (jobName) {
        try {
          passiveRankStats = await fetchA2ToolPassiveSkillStats(jobName);
        } catch (error) {
          warnings.push(
            `패시브 랭커 추천 조회 실패: ${error instanceof Error ? error.message : "unknown"}`,
          );
        }
      }

      if (passiveRankStats.length > 0) {
        const maxPassiveLevel = passiveSkills.reduce((max, entry) => Math.max(max, entry.level), 0);
        const passiveNeedImprove = passiveRankStats
          .slice(0, 8)
          .map((entry) => {
            const current = passiveByName.get(normalizeSkillName(entry.name));
            const currentLevel = current?.level ?? 0;
            const missing = !current;
            const levelGap = missing ? maxPassiveLevel : Math.max(0, maxPassiveLevel - currentLevel);
            return {
              ...entry,
              currentLevel,
              missing,
              levelGap,
            };
          })
          .filter((entry) => entry.missing || entry.levelGap >= 2)
          .sort((a, b) => {
            if (Number(b.missing) !== Number(a.missing)) {
              return Number(b.missing) - Number(a.missing);
            }
            if (b.pickRate !== a.pickRate) {
              return b.pickRate - a.pickRate;
            }
            return a.currentLevel - b.currentLevel;
          });

        if (passiveNeedImprove.length > 0) {
          const missingCount = passiveNeedImprove.filter((entry) => entry.missing).length;
          const minCurrent = passiveNeedImprove.reduce((min, entry) => Math.min(min, entry.currentLevel), Number.POSITIVE_INFINITY);
          otherRecommendations.push({
            key: "passive-ranker",
            title: "패시브 스킬 추천",
            reason: `랭커 추천 패시브 대비 보완 항목 ${passiveNeedImprove.length}개`,
            currentValue: missingCount > 0 ? `미습득 ${missingCount}개` : `최저 Lv.${Number.isFinite(minCurrent) ? minCurrent : 0}`,
            targetValue: "랭커 상위 패시브 우선 습득/강화",
            priority: missingCount > 0 ? "high" : "medium",
            examples: passiveNeedImprove
              .slice(0, 3)
              .map((entry) =>
                entry.missing
                  ? `${entry.name} (미습득, 채용 ${entry.pickRate.toFixed(1)}%)`
                  : `${entry.name} (Lv.${entry.currentLevel}, 채용 ${entry.pickRate.toFixed(1)}%)`,
              ),
          });
        }
      } else {
        const maxPassiveLevel = passiveSkills.reduce((max, entry) => Math.max(max, entry.level), 0);
        const lowPassives = passiveSkills.filter((entry) => entry.level < maxPassiveLevel).sort((a, b) => a.level - b.level);
        if (lowPassives.length > 0) {
          const minPassive = lowPassives[0]?.level ?? maxPassiveLevel;
          otherRecommendations.push({
            key: "passive-skill-level",
            title: "패시브 스킬 레벨",
            reason: `최대 Lv.${maxPassiveLevel} 대비 낮은 패시브 ${lowPassives.length}개`,
            currentValue: `최저 Lv.${minPassive}`,
            targetValue: `Lv.${maxPassiveLevel} 근접 권장`,
            priority: minPassive <= Math.max(1, maxPassiveLevel - 6) ? "high" : "medium",
            examples: lowPassives.slice(0, 3).map((entry) => `${entry.name} (Lv.${entry.level})`),
          });
        }
      }
    }
  }

  const parsedStigmas = asArray(resolvedData.stigmas)
    .map((entry) => asRecord(entry))
    .filter((entry): entry is UnknownRecord => entry !== null)
    .map((entry) => ({
      name: toText(entry.name),
      level: toNumber(entry.level_int ?? entry.level, 0),
    }))
    .filter((entry) => entry.name.length > 0 && entry.level > 0);
  if (parsedStigmas.length > 0) {
    const maxStigmaLevel = parsedStigmas.reduce((max, entry) => Math.max(max, entry.level), 0);
    const lowStigmas = parsedStigmas.filter((entry) => entry.level < maxStigmaLevel).sort((a, b) => a.level - b.level);
    if (lowStigmas.length > 0) {
      const minStigma = lowStigmas[0]?.level ?? maxStigmaLevel;
      otherRecommendations.push({
        key: "stigma-level",
        title: "스티그마 레벨",
        reason: `최대 Lv.${maxStigmaLevel} 대비 낮은 스티그마 ${lowStigmas.length}개`,
        currentValue: `최저 Lv.${minStigma}`,
        targetValue: `Lv.${maxStigmaLevel} 근접 권장`,
        priority: minStigma <= Math.max(1, maxStigmaLevel - 6) ? "high" : "medium",
        examples: lowStigmas.slice(0, 3).map((entry) => `${entry.name} (Lv.${entry.level})`),
      });
    }
  }

  return NextResponse.json({
    source: "a2tool-api",
    character: {
      nickname: toText(resolvedData.nickname) || name,
      serverId,
      race: toText(resolvedData.race) || (resolvedRace === 1 ? "천족" : "마족"),
      className: toText(resolvedData.job),
      itemLevel: pickItemLevel(resolvedData),
      combatPower: currentCp,
    },
    magicStone: {
      totalCpContrib: magicStoneItems.reduce((sum, item) => sum + item.totalCpContrib, 0),
      items: magicStoneItems,
    },
    breakthrough: {
      items: breakthroughItems,
    },
    other: {
      items: otherRecommendations,
    },
    warnings,
  });
}
