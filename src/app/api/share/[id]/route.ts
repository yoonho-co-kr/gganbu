import { NextResponse } from "next/server";

import { getShare } from "@/lib/share-store";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: {
    params: Promise<{ id: string }>;
  },
) {
  const { id } = await context.params;
  const shared = await getShare(id);

  if (!shared) {
    return NextResponse.json({ error: "공유 데이터를 찾을 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json({
    id: shared.id,
    createdAt: shared.createdAt,
    snapshot: shared.snapshot,
  });
}
