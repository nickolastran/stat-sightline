import PlayerModule from "@/components/dashboard/PlayerModule";

/* PITCHING module: one pitcher's pitches thrown. */
export default async function PitcherPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <PlayerModule role="pitcher" id={(await params).id} />;
}
