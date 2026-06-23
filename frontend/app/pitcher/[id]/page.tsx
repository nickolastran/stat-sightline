import { getPitcherPitches } from "@/lib/api";
import PitchChart from "@/components/PitchChart";

export default async function PitcherPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getPitcherPitches(Number(id));

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-baseline justify-between">
        <h2 className="text-xl font-semibold">
          {data.pitcher.full_name ?? `Pitcher #${id}`}
        </h2>
        <span className="text-sm text-slate-400">
          {data.pitcher.throws ?? "?"}HP · {data.count.toLocaleString()} located pitches
        </span>
      </div>
      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
        <PitchChart pitches={data.pitches} />
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Pitch locations at the plate (catcher&apos;s view), colored by pitch type.
      </p>
    </div>
  );
}
