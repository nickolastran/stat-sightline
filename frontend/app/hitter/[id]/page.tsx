import PlayerModule from "@/components/dashboard/PlayerModule";

/* HITTING module: one batter's pitches seen. */
export default async function HitterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <PlayerModule role="batter" id={(await params).id} />;
}
