import PartyBuilderPage from "@/components/party-builder-page";
import { decodeSnapshotToken } from "@/lib/share-link-server";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ snapshot?: string | string[] }>;
}) {
  const resolved = await searchParams;
  const snapshotParam = Array.isArray(resolved.snapshot) ? resolved.snapshot[0] : resolved.snapshot;
  const initialSnapshot = snapshotParam ? decodeSnapshotToken(snapshotParam) : null;

  return <PartyBuilderPage initialSnapshot={initialSnapshot ?? undefined} />;
}
