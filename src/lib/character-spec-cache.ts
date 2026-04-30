import type { CharacterSummary } from "@/types/character";
import type { ShareSnapshot } from "@/types/share";

type CachedCharacterSpec = {
  characterId: string;
  name: string;
  serverId: number;
  serverName?: string;
  level?: number;
  race?: number;
  classId?: number;
  className?: string;
  classKey?: string;
  classIconUrl?: string | null;
  itemLevel: number;
  combatPower: number;
  profileImageUrl?: string | null;
  cachedAt: string;
};

const CACHE_TTL_DAYS = 7;
const CACHE_TTL_SECONDS = CACHE_TTL_DAYS * 24 * 60 * 60;
const KEY_PREFIX = "character-spec:";

const KV_REST_API_URL = process.env.KV_REST_API_URL?.trim() ?? "";
const KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN?.trim() ?? "";
const UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL?.trim() ?? "";
const UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN?.trim() ?? "";

const REST_API_URL = KV_REST_API_URL || UPSTASH_REDIS_REST_URL;
const REST_API_TOKEN = KV_REST_API_TOKEN || UPSTASH_REDIS_REST_TOKEN;
const hasUpstashKv = REST_API_URL.length > 0 && REST_API_TOKEN.length > 0;

function normalizeCharacterId(value: string) {
  let normalized = value.trim();

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

function normalizeName(value: string) {
  return value.replace(/<[^>]+>/g, "").trim().toLowerCase();
}

function specIdKey(serverId: number, characterId: string) {
  return `${KEY_PREFIX}id:${serverId}:${normalizeCharacterId(characterId)}`;
}

function specNameKey(serverId: number, name: string) {
  return `${KEY_PREFIX}name:${serverId}:${normalizeName(name)}`;
}

async function upstashCommand<T = unknown>(command: Array<string | number>): Promise<T | null> {
  if (!hasUpstashKv) {
    return null;
  }

  const response = await fetch(REST_API_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${REST_API_TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
  });

  const payload = (await response.json()) as { result?: T; error?: string };
  if (!response.ok || payload.error) {
    throw new Error(payload.error ?? `upstash error: ${response.status}`);
  }

  return (payload.result ?? null) as T | null;
}

function hasUsableSpec(character: Pick<CharacterSummary, "itemLevel" | "combatPower">) {
  return character.itemLevel > 0 || character.combatPower > 0;
}

function toCachedSpec(character: CharacterSummary): CachedCharacterSpec {
  return {
    characterId: normalizeCharacterId(character.characterId),
    name: character.name,
    serverId: character.serverId,
    serverName: character.serverName,
    level: character.level,
    race: character.race,
    classId: character.classId,
    className: character.className,
    classKey: character.classKey,
    classIconUrl: character.classIconUrl,
    itemLevel: character.itemLevel,
    combatPower: character.combatPower,
    profileImageUrl: character.profileImageUrl,
    cachedAt: new Date().toISOString(),
  };
}

function parseCachedSpec(raw: string | null): CachedCharacterSpec | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<CachedCharacterSpec>;
    const serverId = parsed.serverId;
    const itemLevel = parsed.itemLevel;
    const combatPower = parsed.combatPower;

    if (
      !parsed.characterId ||
      !parsed.name ||
      !Number.isFinite(serverId) ||
      !Number.isFinite(itemLevel) ||
      !Number.isFinite(combatPower)
    ) {
      return null;
    }

    if ((itemLevel ?? 0) <= 0 && (combatPower ?? 0) <= 0) {
      return null;
    }

    return parsed as CachedCharacterSpec;
  } catch {
    return null;
  }
}

export async function setCharacterSpecCache(character: CharacterSummary) {
  if (!hasUpstashKv || !hasUsableSpec(character)) {
    return;
  }

  const serialized = JSON.stringify(toCachedSpec(character));
  const keys = [specIdKey(character.serverId, character.characterId), specNameKey(character.serverId, character.name)];

  await Promise.all(
    keys.map((key) => upstashCommand(["SETEX", key, CACHE_TTL_SECONDS, serialized]).catch(() => null)),
  );
}

export async function getCharacterSpecCache(character: { characterId?: string; name: string; serverId: number }) {
  if (!hasUpstashKv) {
    return null;
  }

  const keys = [
    character.characterId ? specIdKey(character.serverId, character.characterId) : null,
    specNameKey(character.serverId, character.name),
  ].filter((key): key is string => Boolean(key));

  for (const key of keys) {
    try {
      const cached = parseCachedSpec(await upstashCommand<string>(["GET", key]));
      if (cached) {
        return cached;
      }
    } catch {
      // Cache is an optional fallback. Live search should continue if it fails.
    }
  }

  return null;
}

function collectSnapshotCharacters(snapshot: ShareSnapshot) {
  const characters = new Map<string, CharacterSummary>();

  for (const character of snapshot.waitingList) {
    if (hasUsableSpec(character)) {
      characters.set(`${character.serverId}:${normalizeCharacterId(character.characterId)}`, character);
    }
  }

  for (const party of snapshot.parties) {
    for (const character of party.slots) {
      if (character && hasUsableSpec(character)) {
        characters.set(`${character.serverId}:${normalizeCharacterId(character.characterId)}`, character);
      }
    }
  }

  return [...characters.values()];
}

export async function setShareSnapshotCharacterSpecCache(snapshot: ShareSnapshot) {
  if (!hasUpstashKv) {
    return;
  }

  await Promise.all(collectSnapshotCharacters(snapshot).map((character) => setCharacterSpecCache(character)));
}
