import type { ReactNode } from "react";

import type { CharacterSummary } from "@/types/character";
import type { ShareSnapshot } from "@/types/share";

import {
  EQUIPMENT_BREAKTHROUGH_MAX,
  EQUIPMENT_CATEGORY_ORDER,
  RUNE_SLOT_NAMES,
  SLOT_COUNT,
  SLOT_MEMO_MAX_LENGTH,
} from "./constants";
import type {
  CharacterDetailEquipmentItem,
  EquipmentCategoryKey,
  ParsedCharacterLink,
  Party,
  PartyKind,
  SlotMemoMap,
} from "./types";

export function getEquipmentCategory(slotPosName: string): EquipmentCategoryKey {
  if (slotPosName.startsWith("Rune")) {
    return "rune";
  }

  if (slotPosName.startsWith("Arcana")) {
    return "arcana";
  }

  if (
    [
      "MainHand",
      "SubHand",
      "OneHand",
      "TwoHand",
      "Greatsword",
      "Sword",
      "Dagger",
      "Bow",
      "Mace",
      "Staff",
      "Polearm",
      "Orb",
      "Spellbook",
      "Gun",
      "Harp",
      "Shield",
    ].includes(slotPosName)
  ) {
    return "weapon";
  }

  if (["Helmet", "Shoulder", "Torso", "Pants", "Gloves", "Boots", "Cape"].includes(slotPosName)) {
    return "armor";
  }

  if (
    [
      "Necklace",
      "Earring1",
      "Earring2",
      "EarringL",
      "EarringR",
      "Ring1",
      "Ring2",
      "Bracelet1",
      "Bracelet2",
      "Belt",
      "Amulet",
    ].includes(slotPosName)
  ) {
    return "accessory";
  }

  return "other";
}

export function getEquipmentCategoryLabel(category: EquipmentCategoryKey) {
  if (category === "weapon") return "무기";
  if (category === "armor") return "방어구";
  if (category === "accessory") return "악세";
  if (category === "rune") return "룬";
  if (category === "arcana") return "아르카나";
  return "기타";
}

export function groupEquipmentItems(
  items: CharacterDetailEquipmentItem[],
  options?: { includeEmptyRuneGroup?: boolean },
) {
  const sorted = [...items].sort(
    (a, b) =>
      EQUIPMENT_CATEGORY_ORDER.indexOf(getEquipmentCategory(a.slotPosName)) -
        EQUIPMENT_CATEGORY_ORDER.indexOf(getEquipmentCategory(b.slotPosName)) || a.slotPos - b.slotPos,
  );
  const groups = new Map<EquipmentCategoryKey, CharacterDetailEquipmentItem[]>();

  for (const item of sorted) {
    const category = getEquipmentCategory(item.slotPosName);
    const existing = groups.get(category) ?? [];
    existing.push(item);
    groups.set(category, existing);
  }

  return EQUIPMENT_CATEGORY_ORDER.filter((category) => {
    if (options?.includeEmptyRuneGroup && category === "rune") {
      return true;
    }
    return (groups.get(category)?.length ?? 0) > 0;
  }).map((category) => ({
    category,
    label: getEquipmentCategoryLabel(category),
    items: groups.get(category) ?? [],
  }));
}

export function getEquipmentGradeTone(grade: string) {
  const normalized = grade.toLowerCase();

  if (normalized === "epic") {
    return {
      row: "border-orange-700/60 bg-orange-950/30",
      name: "text-orange-200",
    };
  }

  if (normalized === "special") {
    return {
      row: "border-teal-700/60 bg-teal-950/30",
      name: "text-teal-200",
    };
  }

  if (normalized === "unique") {
    return {
      row: "border-amber-700/60 bg-amber-950/20",
      name: "text-amber-200",
    };
  }

  if (normalized === "rare") {
    return {
      row: "border-sky-700/60 bg-sky-950/20",
      name: "text-sky-200",
    };
  }

  return {
    row: "border-neutral-700 bg-neutral-900/40",
    name: "text-neutral-200",
  };
}

export function formatBreakthroughSummary(items: CharacterDetailEquipmentItem[]) {
  const total = items.reduce((sum, item) => sum + Math.max(0, item.exceedLevel), 0);
  return `총 ${total}돌파`;
}

export function formatRuneSummary(items: CharacterDetailEquipmentItem[]) {
  const filled = items.filter((item) => RUNE_SLOT_NAMES.includes(item.slotPosName)).length;
  return `${filled}/2 슬롯`;
}

function clampBreakthroughLevel(exceedLevel: number) {
  return Math.max(0, Math.min(EQUIPMENT_BREAKTHROUGH_MAX, exceedLevel));
}

export function renderBreakthroughPips(exceedLevel: number): ReactNode {
  const activeCount = clampBreakthroughLevel(exceedLevel);

  return (
    <span className="inline-flex items-center gap-0.5">
      {Array.from({ length: EQUIPMENT_BREAKTHROUGH_MAX }, (_, index) => {
        const active = index < activeCount;
        return (
          <span
            key={`breakthrough-pip-${index}`}
            className={`h-1.5 w-1.5 rounded-full ${active ? "bg-emerald-400" : "bg-neutral-700"}`}
          />
        );
      })}
    </span>
  );
}

export function createParty(kind: PartyKind, index: number, id?: string): Party {
  return {
    id: id ?? `${kind}-${index}`,
    name: `${kind === "rudra" ? "루드라" : "침식"} 파티 ${index}`,
    kind,
    slots: Array.from({ length: SLOT_COUNT }, () => null),
  };
}

export function generateNextPartyId(kind: PartyKind, existing: Party[]) {
  const ids = new Set(existing.map((party) => party.id));
  let index = existing.filter((party) => party.kind === kind).length + 1;
  let candidate = `${kind}-${index}`;

  while (ids.has(candidate)) {
    index += 1;
    candidate = `${kind}-${index}`;
  }

  return candidate;
}

export function formatNumber(value: number) {
  return Number.isFinite(value) ? value.toLocaleString("ko-KR") : "-";
}

export function formatAverage(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "-";
  }
  return Math.round(value).toLocaleString("ko-KR");
}

export function calculatePartyAverage(slots: Array<CharacterSummary | null>) {
  const members = slots.filter((slot): slot is CharacterSummary => slot !== null);
  if (members.length === 0) {
    return { memberCount: 0, itemLevelAverage: null, combatPowerAverage: null };
  }

  const totals = members.reduce(
    (sum, character) => ({
      itemLevel: sum.itemLevel + Math.max(0, character.itemLevel),
      combatPower: sum.combatPower + Math.max(0, character.combatPower),
    }),
    { itemLevel: 0, combatPower: 0 },
  );

  return {
    memberCount: members.length,
    itemLevelAverage: totals.itemLevel / members.length,
    combatPowerAverage: totals.combatPower / members.length,
  };
}

export function getClassBadgeToneClass(className?: string) {
  if (className === "수호성") return "border-blue-500/60 bg-blue-500/10 text-blue-300";
  if (className === "검성") return "border-sky-500/60 bg-sky-500/10 text-sky-300";
  if (className === "살성") return "border-emerald-500/60 bg-emerald-500/10 text-emerald-300";
  if (className === "궁성") return "border-lime-500/60 bg-lime-500/10 text-lime-300";
  if (className === "호법성") return "border-orange-500/60 bg-orange-500/10 text-orange-300";
  if (className === "치유성") return "border-yellow-500/60 bg-yellow-500/10 text-yellow-300";
  if (className === "정령성") return "border-pink-500/60 bg-pink-500/10 text-pink-300";
  if (className === "마도성") return "border-violet-500/60 bg-violet-500/10 text-violet-300";
  return "border-neutral-600 bg-neutral-800 text-neutral-200";
}

export function sameCharacter(a: CharacterSummary, b: CharacterSummary) {
  return a.characterId === b.characterId && a.serverId === b.serverId;
}

export function characterKey(character: CharacterSummary) {
  return `${character.serverId}:${normalizeCharacterId(character.characterId)}`;
}

export function normalizeCharacterId(characterId: string) {
  let normalized = characterId.trim();
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

export function parseCharacterLink(input: string): ParsedCharacterLink | null {
  const raw = input.trim();
  if (!raw) {
    return null;
  }

  const normalizedInput = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

  let url: URL;
  try {
    url = new URL(normalizedInput);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split("/").filter(Boolean);

  if (host.includes("aion2.plaync.com")) {
    const charactersIndex = segments.findIndex((segment) => segment === "characters");
    if (charactersIndex >= 0) {
      const serverSegment = segments[charactersIndex + 1];
      const characterSegment = segments[charactersIndex + 2];

      if (serverSegment === "character-info") {
        const serverIdFromQuery = Number(url.searchParams.get("serverId") ?? "");
        const characterIdFromQuery = normalizeCharacterId(url.searchParams.get("characterId") ?? "");
        if (serverIdFromQuery > 0 && characterIdFromQuery) {
          return {
            source: "plaync-link",
            serverId: serverIdFromQuery,
            characterId: characterIdFromQuery,
          };
        }
      }

      if (serverSegment && characterSegment && /^\d+$/.test(serverSegment)) {
        return {
          source: "plaync-link",
          serverId: Number(serverSegment),
          characterId: normalizeCharacterId(characterSegment),
        };
      }
    }

    const serverIdFromQuery = Number(url.searchParams.get("serverId") ?? "");
    const characterIdFromQuery = normalizeCharacterId(url.searchParams.get("characterId") ?? "");
    if (serverIdFromQuery > 0 && characterIdFromQuery) {
      return {
        source: "plaync-link",
        serverId: serverIdFromQuery,
        characterId: characterIdFromQuery,
      };
    }
  }

  if (host.includes("aion2tool.com")) {
    const charIndex = segments.findIndex((segment) => segment === "char");
    const serverSegment = segments[charIndex + 1] ?? "";
    const nameSegment = segments[charIndex + 2] ?? "";
    const match = serverSegment.match(/^serverid=(\d+)$/i);
    if (charIndex >= 0 && match && nameSegment) {
      let decodedName = nameSegment.trim();
      try {
        decodedName = decodeURIComponent(nameSegment).trim();
      } catch {
        decodedName = nameSegment.trim();
      }
      if (!decodedName) {
        return null;
      }
      return {
        source: "a2tool-link",
        serverId: Number(match[1]),
        name: decodedName,
      };
    }
  }

  return null;
}

export function slotMemoKey(partyId: string, slotIndex: number) {
  return `${partyId}:${slotIndex}`;
}

export function parseSlotMemos(input: unknown): SlotMemoMap {
  if (!input || typeof input !== "object") {
    return {};
  }

  const next: SlotMemoMap = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (typeof value !== "string") {
      continue;
    }
    const normalized = value.slice(0, SLOT_MEMO_MAX_LENGTH);
    if (normalized.length === 0) {
      continue;
    }
    next[key] = normalized;
  }
  return next;
}

export function copyParties(parties: Party[]): Party[] {
  return parties.map((party) => ({
    ...party,
    slots: [...party.slots],
  }));
}

export function createDefaultParties() {
  return [createParty("rudra", 1, "rudra-1"), createParty("erosion", 1, "erosion-1")];
}

export function clonePartiesFromSnapshot(parties: ShareSnapshot["parties"]): Party[] {
  return parties.map((party) => ({
    ...party,
    slots: party.slots
      .slice(0, SLOT_COUNT)
      .concat(Array.from({ length: SLOT_COUNT }, () => null))
      .slice(0, SLOT_COUNT),
  }));
}

export function mergeCharacterStats(base: CharacterSummary, fresh: CharacterSummary): CharacterSummary {
  return {
    ...base,
    serverName: fresh.serverName || base.serverName,
    classId: fresh.classId ?? base.classId,
    className: fresh.className ?? base.className,
    classKey: fresh.classKey ?? base.classKey,
    classIconUrl: fresh.classIconUrl ?? base.classIconUrl,
    itemLevel: fresh.itemLevel > 0 ? fresh.itemLevel : base.itemLevel,
    combatPower: fresh.combatPower > 0 ? fresh.combatPower : base.combatPower,
    source: fresh.source ?? base.source,
  };
}
