"""Build the standings projection: ingest game results, then fit the model.

Examples:
    # Default: 2021 through the current season, then train
    python scripts/train_standings.py

    # In-season refresh — re-pull the current season only, then retrain
    python scripts/train_standings.py --seasons 2026

    # Retrain on what is already on disk (no network)
    python scripts/train_standings.py --skip-ingest

    # Ingest only, leave the existing model alone
    python scripts/train_standings.py --skip-train
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

FIRST_SEASON = 2021  # five prior seasons is plenty for 30-game rolling form


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Build the MLB standings projection model.")
    p.add_argument("--seasons", type=int, nargs="+", default=None,
                   help=f"seasons to ingest (default {FIRST_SEASON}..current)")
    p.add_argument("--holdout", type=int, default=None,
                   help="season to validate on (default: the latest ingested)")
    p.add_argument("--skip-ingest", action="store_true", help="train on games.csv as-is")
    p.add_argument("--skip-train", action="store_true", help="ingest only, keep the model")
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)

    from src.stat_sightline.standings import ingest as ingest_mod
    from src.stat_sightline.standings import train as train_mod

    seasons = args.seasons or list(range(FIRST_SEASON, ingest_mod.today_et().year + 1))

    if not args.skip_ingest:
        print(f"Ingesting seasons {seasons[0]}–{seasons[-1]} from the MLB Stats API ...")
        total = ingest_mod.ingest(seasons)
        print(f"  {total:,} games -> {ingest_mod.GAMES_CSV}")
    elif not ingest_mod.GAMES_CSV.exists():
        print(f"No {ingest_mod.GAMES_CSV}; drop --skip-ingest to fetch it.")
        return 1

    if args.skip_train:
        print("  --skip-train set; model left untouched.")
        return 0

    import pandas as pd

    bundle = train_mod.train(pd.read_csv(ingest_mod.GAMES_CSV), holdout_season=args.holdout)
    train_mod.save(bundle)

    m = bundle["metrics"]
    print(f"Trained on {m['train_games']:,} games "
          f"(seasons {bundle['seasons'][0]}–{bundle['seasons'][-1]})")
    if m.get("holdout_games"):
        print(f"  holdout {m['holdout_season']}  n={m['holdout_games']:,}")
        print(f"  accuracy      {m['accuracy']:.3f}"
              f"  (always-home baseline {m['home_baseline']:.3f})")
        print(f"  log loss      {m['log_loss']:.3f}")
        print(f"  run-diff MAE  {m['run_diff_mae']:.2f}")
    print(f"Saved {train_mod.MODEL_PKL}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
