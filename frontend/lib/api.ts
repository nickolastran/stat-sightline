const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface Pitcher {
  player_id: number;
  full_name: string | null;
  throws: string | null;
  pitches?: number | null;
}

export interface Pitch {
  pitch_type: string | null;
  pitch_name: string | null;
  plate_x: number | null;
  plate_z: number | null;
  release_speed: number | null;
  pfx_x: number | null;
  pfx_z: number | null;
  description: string | null;
  stand: string | null;
}

export interface PitcherPitches {
  pitcher: Pitcher;
  count: number;
  pitches: Pitch[];
}

export async function searchPitchers(q = ""): Promise<Pitcher[]> {
  const res = await fetch(`${API_URL}/api/pitchers?q=${encodeURIComponent(q)}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`searchPitchers failed: ${res.status}`);
  return res.json();
}

export async function getPitcherPitches(
  pitcherId: number,
  opts: { pitchType?: string; stand?: "L" | "R" } = {}
): Promise<PitcherPitches> {
  const params = new URLSearchParams();
  if (opts.pitchType) params.set("pitch_type", opts.pitchType);
  if (opts.stand) params.set("stand", opts.stand);
  const res = await fetch(
    `${API_URL}/api/pitchers/${pitcherId}/pitches?${params.toString()}`,
    { cache: "no-store" }
  );
  if (!res.ok) throw new Error(`getPitcherPitches failed: ${res.status}`);
  return res.json();
}
