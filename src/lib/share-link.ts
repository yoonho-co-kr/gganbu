import { parseShareSnapshot } from "@/lib/share-snapshot";
import type { ShareSnapshot } from "@/types/share";

function encodeUtf8ToBase64Url(value: string) {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(value, "utf8").toString("base64url");
  }

  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64UrlToUtf8(value: string) {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(value, "base64url").toString("utf8");
  }

  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new TextDecoder().decode(bytes);
}

export function encodeSnapshotToToken(snapshot: ShareSnapshot) {
  return encodeUtf8ToBase64Url(JSON.stringify(snapshot));
}

export function decodeSnapshotFromToken(token: string): ShareSnapshot | null {
  try {
    const json = decodeBase64UrlToUtf8(token);
    return parseShareSnapshot(JSON.parse(json));
  } catch {
    return null;
  }
}
