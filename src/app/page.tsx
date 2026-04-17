import PartyBuilderPage from "@/components/party-builder-page";
import { decodeSnapshotFromToken } from "@/lib/share-link";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ snapshot?: string | string[] }>;
}) {
  const resolved = await searchParams;
  const snapshotParam = Array.isArray(resolved.snapshot) ? resolved.snapshot[0] : resolved.snapshot;
  const initialSnapshot = snapshotParam ? decodeSnapshotFromToken(snapshotParam) : null;

  return <PartyBuilderPage initialSnapshot={initialSnapshot ?? undefined} />;
}
