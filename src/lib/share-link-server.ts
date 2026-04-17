import { deflateRawSync, inflateRawSync } from "node:zlib";

import { decodeSnapshotFromToken } from "@/lib/share-link";
import { parseShareSnapshot } from "@/lib/share-snapshot";
import type { ShareSnapshot } from "@/types/share";

const COMPRESSED_TOKEN_PREFIX = "z1.";

export function encodeCompressedSnapshotToken(snapshot: ShareSnapshot) {
  const normalized = parseShareSnapshot(snapshot);
  if (!normalized) {
    throw new Error("유효하지 않은 스냅샷입니다.");
  }

  const raw = Buffer.from(JSON.stringify(normalized), "utf8");
  const compressed = deflateRawSync(raw, { level: 9 });
  return `${COMPRESSED_TOKEN_PREFIX}${compressed.toString("base64url")}`;
}

export function decodeSnapshotToken(token: string): ShareSnapshot | null {
  if (token.startsWith(COMPRESSED_TOKEN_PREFIX)) {
    try {
      const encoded = token.slice(COMPRESSED_TOKEN_PREFIX.length);
      const compressed = Buffer.from(encoded, "base64url");
      const raw = inflateRawSync(compressed).toString("utf8");
      return parseShareSnapshot(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  return decodeSnapshotFromToken(token);
}
