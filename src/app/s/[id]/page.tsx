import Link from "next/link";

import PartyBuilderPage from "@/components/party-builder-page";
import { getShare } from "@/lib/share-store";

export const runtime = "nodejs";

export default async function SharedPartyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const shared = await getShare(id);

  if (!shared) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center justify-center p-6">
        <div className="w-full rounded-xl border border-slate-800 bg-slate-900/95 p-6 text-center">
          <h1 className="text-xl font-semibold text-slate-100">공유 링크를 찾을 수 없습니다.</h1>
          <p className="mt-2 text-sm text-slate-400">
            만료되었거나 잘못된 링크일 수 있습니다. 새로운 공유 링크를 다시 생성해 주세요.
          </p>
          <Link
            href="/"
            className="mt-4 inline-flex rounded-md border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-100 transition hover:bg-slate-700"
          >
            홈으로 이동
          </Link>
        </div>
      </main>
    );
  }

  return <PartyBuilderPage initialSnapshot={shared.snapshot} sharedId={shared.id} sharedCreatedAt={shared.createdAt} />;
}
