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
  release_spin_rate: number | null;
  pfx_x: number | null;
  pfx_z: number | null;
  description: string | null;
  stand: string | null;
  game_date: string | null; // ISO date
  balls: number | null;
  strikes: number | null;
  outs_when_up: number | null;
  inning: number | null;
  runners_on: boolean | null;
  zone: number | null; // Statcast 1-14; 1-9 = in zone
  launch_speed: number | null; // exit velocity, mph
  launch_angle: number | null; // degrees
  events: string | null;
}

export interface PitcherPitches {
  pitcher: Pitcher;
  count: number;
  pitches: Pitch[];
}

export async function searchPitchers(q = "", limit = 25): Promise<Pitcher[]> {
  const params = new URLSearchParams({ q, limit: String(limit) });
  const res = await fetch(`${API_URL}/api/pitchers?${params}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`searchPitchers failed: ${res.status}`);
  return res.json();
}

export async function getPitcherPitches(
  pitcherId: number,
  opts: { pitchType?: string; stand?: "L" | "R"; limit?: number } = {}
): Promise<PitcherPitches> {
  const params = new URLSearchParams();
  if (opts.pitchType) params.set("pitch_type", opts.pitchType);
  if (opts.stand) params.set("stand", opts.stand);
  if (opts.limit) params.set("limit", String(opts.limit));
  const res = await fetch(
    `${API_URL}/api/pitchers/${pitcherId}/pitches?${params.toString()}`,
    { cache: "no-store" }
  );
  if (!res.ok) throw new Error(`getPitcherPitches failed: ${res.status}`);
  return res.json();
}
