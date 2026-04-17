import { NextResponse } from "next/server";

import { encodeSnapshotToToken } from "@/lib/share-link";
import { parseShareSnapshot } from "@/lib/share-snapshot";
import { createShare } from "@/lib/share-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { snapshot?: unknown } | null;
    const snapshot = parseShareSnapshot(body?.snapshot);
    const origin = new URL(request.url).origin;

    if (!snapshot) {
      return NextResponse.json({ error: "유효하지 않은 스냅샷입니다." }, { status: 400 });
    }

    try {
      const stored = await createShare(snapshot);

      return NextResponse.json({
        id: stored.id,
        createdAt: stored.createdAt,
        url: `${origin}/s/${stored.id}`,
        mode: "stored",
      });
    } catch {
      const token = encodeSnapshotToToken(snapshot);
      return NextResponse.json({
        id: `snapshot-${Date.now().toString(36)}`,
        createdAt: new Date().toISOString(),
        url: `${origin}/?snapshot=${encodeURIComponent(token)}`,
        mode: "snapshot",
        warning: "서버 저장이 불가하여 URL 스냅샷 링크로 대체되었습니다.",
      });
    }
  } catch {
    return NextResponse.json({ error: "공유 링크 생성에 실패했습니다." }, { status: 500 });
  }
}
