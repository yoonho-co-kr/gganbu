import { randomBytes } from "crypto";
import { promises as fs } from "fs";
import path from "path";

import { parseShareSnapshot } from "@/lib/share-snapshot";
import type { ShareSnapshot, StoredShare } from "@/types/share";

const SHARE_DIR = path.join(process.cwd(), ".data", "shares");
const SHARE_TTL_DAYS = 30;
const MAX_ID_RETRY = 5;
const SHARE_ID_REGEX = /^[a-zA-Z0-9_-]{6,40}$/;

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

async function generateShareId() {
  await ensureShareDir();

  for (let retry = 0; retry < MAX_ID_RETRY; retry += 1) {
    const candidate = randomBytes(8).toString("base64url");
    const filePath = sharePath(candidate);

    try {
      await fs.access(filePath);
    } catch {
      return candidate;
    }
  }

  throw new Error("공유 ID 생성에 실패했습니다.");
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

  await fs.writeFile(sharePath(id), JSON.stringify(stored), "utf8");

  if (Math.random() < 0.2) {
    void cleanupExpiredShares();
  }

  return stored;
}

export async function getShare(shareId: string): Promise<StoredShare | null> {
  if (!SHARE_ID_REGEX.test(shareId)) {
    return null;
  }

  try {
    const raw = await fs.readFile(sharePath(shareId), "utf8");
    const parsed = JSON.parse(raw) as Partial<StoredShare>;
    if (!parsed || parsed.id !== shareId || typeof parsed.createdAt !== "string") {
      return null;
    }

    if (isExpired(parsed.createdAt)) {
      await fs.unlink(sharePath(shareId)).catch(() => undefined);
      return null;
    }

    const snapshot = parseShareSnapshot(parsed.snapshot);
    if (!snapshot) {
      return null;
    }

    return {
      id: shareId,
      createdAt: parsed.createdAt,
      snapshot,
    };
  } catch {
    return null;
  }
}
