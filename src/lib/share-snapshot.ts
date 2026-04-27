import type { CharacterSource, CharacterSummary } from "@/types/character";
import type { PartySnapshot, ShareSnapshot } from "@/types/share";

const SLOT_COUNT = 8;
const VALID_SOURCES: CharacterSource[] = ["plaync-api", "plaync-scrape"];

function asObject(input: unknown): Record<string, unknown> | null {
  if (!input || typeof input !== "object") {
    return null;
  }
  return input as Record<string, unknown>;
}

function asString(input: unknown): string | null {
  if (typeof input !== "string") {
    return null;
  }
  const trimmed = input.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asNumber(input: unknown, fallback = 0): number {
  if (typeof input === "number" && Number.isFinite(input)) {
    return input;
  }

  if (typeof input === "string") {
    const parsed = Number(input);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function asOptionalNumber(input: unknown): number | undefined {
  if (typeof input === "number" && Number.isFinite(input)) {
    return input;
  }

  if (typeof input === "string") {
    const parsed = Number(input);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function parseCharacter(input: unknown): CharacterSummary | null {
  const raw = asObject(input);
  if (!raw) {
    return null;
  }

  const characterId = asString(raw.characterId);
  const name = asString(raw.name);
  const serverId = asNumber(raw.serverId, NaN);

  if (!characterId || !name || !Number.isFinite(serverId)) {
    return null;
  }

  const source =
    typeof raw.source === "string" && VALID_SOURCES.includes(raw.source as CharacterSource)
      ? (raw.source as CharacterSource)
      : "plaync-api";

  const id = asString(raw.id) ?? `${serverId}:${characterId}`;

  return {
    id,
    characterId,
    name,
    serverId,
    serverName: asString(raw.serverName) ?? `서버 ${serverId}`,
    level: asNumber(raw.level, 0),
    race: asOptionalNumber(raw.race),
    classId: asOptionalNumber(raw.classId),
    className: asString(raw.className) ?? undefined,
    classKey: asString(raw.classKey) ?? undefined,
    classIconUrl: typeof raw.classIconUrl === "string" ? raw.classIconUrl : null,
    itemLevel: asNumber(raw.itemLevel, 0),
    combatPower: asNumber(raw.combatPower, 0),
    profileImageUrl: typeof raw.profileImageUrl === "string" ? raw.profileImageUrl : null,
    source,
  };
}

function parseParty(input: unknown, index: number): PartySnapshot | null {
  const raw = asObject(input);
  if (!raw) {
    return null;
  }

  const id = asString(raw.id) ?? `party-${index + 1}`;
  const name = asString(raw.name) ?? `파티 ${index + 1}`;
  const kind = raw.kind === "erosion" ? "erosion" : "rudra";
  const rawSlots = Array.isArray(raw.slots) ? raw.slots : [];

  const slots: Array<CharacterSummary | null> = Array.from({ length: SLOT_COUNT }, (_, slotIndex) => {
    if (slotIndex >= rawSlots.length) {
      return null;
    }
    return parseCharacter(rawSlots[slotIndex]);
  });

  return { id, name, kind, slots };
}

export function parseShareSnapshot(input: unknown): ShareSnapshot | null {
  const raw = asObject(input);
  if (!raw || !Array.isArray(raw.parties)) {
    return null;
  }

  const parties = raw.parties
    .map((party, index) => parseParty(party, index))
    .filter((party): party is PartySnapshot => party !== null);

  if (parties.length === 0) {
    return null;
  }

  const waitingList = Array.isArray(raw.waitingList)
    ? raw.waitingList.map((character) => parseCharacter(character)).filter((item): item is CharacterSummary => item !== null)
    : [];

  return { parties, waitingList };
}
