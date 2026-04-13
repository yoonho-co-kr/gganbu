import { NextResponse } from "next/server";

import { parseShareSnapshot } from "@/lib/share-snapshot";
import { createShare } from "@/lib/share-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { snapshot?: unknown } | null;
    const snapshot = parseShareSnapshot(body?.snapshot);

    if (!snapshot) {
      return NextResponse.json({ error: "유효하지 않은 스냅샷입니다." }, { status: 400 });
    }

    const stored = await createShare(snapshot);
    const origin = new URL(request.url).origin;

    return NextResponse.json({
      id: stored.id,
      createdAt: stored.createdAt,
      url: `${origin}/s/${stored.id}`,
    });
  } catch {
    return NextResponse.json({ error: "공유 링크 생성에 실패했습니다." }, { status: 500 });
  }
}
