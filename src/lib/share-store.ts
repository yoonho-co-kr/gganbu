import { randomBytes } from "crypto";
import { promises as fs } from "fs";
import path from "path";

import { parseShareSnapshot } from "@/lib/share-snapshot";
import type { ShareSnapshot, StoredShare } from "@/types/share";

const SHARE_DIR = path.join(process.cwd(), ".data", "shares");
const SHARE_TTL_DAYS = 30;
const SHARE_TTL_SECONDS = SHARE_TTL_DAYS * 24 * 60 * 60;
const MAX_ID_RETRY = 5;
const SHARE_ID_REGEX = /^[a-zA-Z0-9_-]{6,40}$/;
const SHARE_KEY_PREFIX = "share:";

const KV_REST_API_URL = process.env.KV_REST_API_URL?.trim() ?? "";
const KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN?.trim() ?? "";
const hasUpstashKv = KV_REST_API_URL.length > 0 && KV_REST_API_TOKEN.length > 0;

function shareKey(shareId: string) {
  return `${SHARE_KEY_PREFIX}${shareId}`;
}

async function upstashCommand<T = unknown>(command: Array<string | number>): Promise<T | null> {
  if (!hasUpstashKv) {
    return null;
  }

  const response = await fetch(KV_REST_API_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${KV_REST_API_TOKEN}`,
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

async function ensureShareDir() {
  await fs.mkdir(SHARE_DIR, { recursive: true });
}

function sharePath(shareId: string) {
  return path.join(SHARE_DIR, `${shareId}.json`);
}

function isExpired(createdAt: string) {
  const parsed = Date.parse(createdAt);
  if (!Number.isFinite(parsed)) {
    return true;
  }

  const ageMs = Date.now() - parsed;
  return ageMs > SHARE_TTL_DAYS * 24 * 60 * 60 * 1000;
}

async function cleanupExpiredShares() {
  try {
    await ensureShareDir();
    const files = await fs.readdir(SHARE_DIR);

    await Promise.all(
      files.map(async (fileName) => {
        if (!fileName.endsWith(".json")) {
          return;
        }

        const filePath = path.join(SHARE_DIR, fileName);
        try {
          const raw = await fs.readFile(filePath, "utf8");
          const parsed = JSON.parse(raw) as Partial<StoredShare>;
          if (!parsed.createdAt || isExpired(parsed.createdAt)) {
            await fs.unlink(filePath);
          }
        } catch {
          await fs.unlink(filePath).catch(() => undefined);
        }
      }),
    );
  } catch {
    // Ignore cleanup failures.
  }
}

async function isShareIdTaken(shareId: string) {
  if (hasUpstashKv) {
    const exists = await upstashCommand<number>(["EXISTS", shareKey(shareId)]);
    return Number(exists ?? 0) > 0;
  }

  await ensureShareDir();
  try {
    await fs.access(sharePath(shareId));
    return true;
  } catch {
    return false;
  }
}

async function generateShareId() {
  for (let retry = 0; retry < MAX_ID_RETRY; retry += 1) {
    const candidate = randomBytes(8).toString("base64url");
    const exists = await isShareIdTaken(candidate);
    if (!exists) {
      return candidate;
    }
  }

  throw new Error("공유 ID 생성에 실패했습니다.");
}

function parseStoredShare(raw: string, expectedId: string): StoredShare | null {
  const parsed = JSON.parse(raw) as Partial<StoredShare>;
  if (!parsed || parsed.id !== expectedId || typeof parsed.createdAt !== "string") {
    return null;
  }

  const snapshot = parseShareSnapshot(parsed.snapshot);
  if (!snapshot) {
    return null;
  }

  return {
    id: expectedId,
    createdAt: parsed.createdAt,
    snapshot,
  };
}

export async function createShare(snapshot: ShareSnapshot): Promise<StoredShare> {
  const normalized = parseShareSnapshot(snapshot);
  if (!normalized) {
    throw new Error("유효하지 않은 스냅샷입니다.");
  }

  const id = await generateShareId();
  const stored: StoredShare = {
    id,
    createdAt: new Date().toISOString(),
    snapshot: normalized,
  };
  const serialized = JSON.stringify(stored);

  if (hasUpstashKv) {
    await upstashCommand(["SETEX", shareKey(id), SHARE_TTL_SECONDS, serialized]);
    return stored;
  }

  await fs.writeFile(sharePath(id), serialized, "utf8");

  if (Math.random() < 0.2) {
    void cleanupExpiredShares();
  }

  return stored;
}

export async function getShare(shareId: string): Promise<StoredShare | null> {
  if (!SHARE_ID_REGEX.test(shareId)) {
    return null;
  }

  if (hasUpstashKv) {
    try {
      const raw = await upstashCommand<string>(["GET", shareKey(shareId)]);
      if (!raw) {
        return null;
      }

      const stored = parseStoredShare(raw, shareId);
      if (!stored) {
        return null;
      }

      // Safety net in case TTL policy changes.
      if (isExpired(stored.createdAt)) {
        await upstashCommand(["DEL", shareKey(shareId)]).catch(() => null);
        return null;
      }

      return stored;
    } catch {
      return null;
    }
  }

  try {
    const raw = await fs.readFile(sharePath(shareId), "utf8");
    const stored = parseStoredShare(raw, shareId);
    if (!stored) {
      return null;
    }

    if (isExpired(stored.createdAt)) {
      await fs.unlink(sharePath(shareId)).catch(() => undefined);
      return null;
    }

    return stored;
  } catch {
    return null;
  }
}
