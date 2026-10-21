"""Pydantic response models for the Stat Sightline API."""

from __future__ import annotations

from datetime import date

from pydantic import BaseModel


class Pitcher(BaseModel):
    player_id: int
    full_name: str | None = None
    throws: str | None = None
    bats: str | None = None           # L / R / S (switch)
    pitches: int | None = None        # thrown (pitchers) or seen (batters)


class Pitch(BaseModel):
    pitch_type: str | None = None
    pitch_name: str | None = None
    plate_x: float | None = None      # ft, catcher's view (+ = toward 3B side)
    plate_z: float | None = None      # ft, height above ground
    release_speed: float | None = None
    release_spin_rate: float | None = None
    pfx_x: float | None = None
    pfx_z: float | None = None
    description: str | None = None
    stand: str | None = None          # batter handedness this pitch
    p_throws: str | None = None       # pitcher handedness this pitch
    sz_top: float | None = None       # this batter's zone top, ft
    sz_bot: float | None = None       # this batter's zone bottom, ft
    game_date: date | None = None
    balls: int | None = None
    strikes: int | None = None
    outs_when_up: int | None = None
    inning: int | None = None
    runners_on: bool | None = None    # any of 1B/2B/3B occupied
    zone: int | None = None           # Statcast 1-14 grid; 1-9 = in zone
    launch_speed: float | None = None # exit velocity, mph
    launch_angle: float | None = None # degrees
    events: str | None = None         # terminal PA outcome, else None
    # Hitting module: barrels, spray, bat tracking, swing value, xwOBA.
    launch_speed_angle: int | None = None  # Statcast 1-6; 6 = barrel
    hc_x: float | None = None         # Gameday hit coordinates
    hc_y: float | None = None
    hit_distance: float | None = None # ft
    bat_speed: float | None = None    # mph, swings only
    swing_length: float | None = None # ft
    run_value: float | None = None    # change in run expectancy
    xwoba: float | None = None        # expected wOBA on contact
    woba_value: float | None = None
    woba_denom: float | None = None


class PitcherPitches(BaseModel):
    pitcher: Pitcher
    count: int
    pitches: list[Pitch]


class ModelInfo(BaseModel):
    """Chronological-holdout quality of the standings model, so the projection
    is shown next to how well it actually predicts."""
    holdout_season: int | None = None
    holdout_games: int | None = None
    train_games: int | None = None
    accuracy: float | None = None
    home_baseline: float | None = None  # always-pick-home, the bar to clear
    log_loss: float | None = None
    run_diff_mae: float | None = None
    trained_at: str | None = None


class TeamProjection(BaseModel):
    team_id: int                 # MLB team id, joins to the standings row
    name: str
    wins: int
    losses: int
    games_played: int
    games_remaining: int
    projected_wins: float        # actual + summed win probability remaining
    projected_losses: float
    pace_wins: float             # the projection prorated to games played
    pace_162: float              # current win rate over a full 162


class StandingsProjection(BaseModel):
    season: int
    as_of: str | None = None     # date of the latest result counted
    model: ModelInfo
    teams: list[TeamProjection]


class TeamOdds(BaseModel):
    """One club's line on the playoff-odds table.

    The four odds are shares of simulated seasons, 0-1. `clinch_wild_card` is
    a berth that wasn't the division, so it and `win_division` add up to
    `make_playoffs` — which is how the table reads across.
    """
    team_id: int
    name: str
    league_id: int
    division_id: int
    division: str
    wins: int
    losses: int
    win_pct: float
    games_back: float
    games_remaining: int
    projected_wins: float
    projected_losses: float
    ros_win_pct: float           # expected win rate over what is left
    strength_of_schedule: float  # mean projected win rate of the opponents left
    win_division: float
    clinch_bye: float            # a top-two seed, so a bye through round one
    clinch_wild_card: float
    make_playoffs: float
    win_world_series: float
    pre_postseason_world_series: float | None = None  # before a postseason game, once the field is set


class PlayoffOdds(BaseModel):
    season: int
    as_of: str | None = None
    simulations: int             # drawn seasons behind every share above
    postseason: bool = False     # the ring is played out of the real bracket
    model: ModelInfo
    teams: list[TeamOdds]


# ── Natural-language query ("ask") ──────────────────────────────────────


class AskAnswer(BaseModel):
    """The headline number, pre-formatted so the UI never re-rounds it."""
    value: float
    display: str                 # "42" | ".311"
    label: str                   # "Home Runs"
    subject: str
    subject_id: int | None = None
    subject_kind: str            # 'player' | 'team'
    role: str                    # 'batter' | 'pitcher'
    timeframe: str
    filters: list[str] = []
    rank: str | None = None      # "5th of 369" against the same filters


class AskLeader(BaseModel):
    rank: int
    player_id: int
    name: str
    value: float
    display: str


class AskGame(BaseModel):
    date: date
    day_of_week: str
    game_pk: int
    team: str | None = None
    opponent: str | None = None
    is_home: bool | None = None
    venue_team: str | None = None
    result: str | None = None    # "W 6-4" from the subject's side
    inning: int | None = None
    event: str | None = None
    detail: str | None = None    # Statcast's play description
    count: int = 1               # how much this row added to the total
    other_id: int | None = None  # the pitcher faced, or the batter faced
    other_name: str | None = None
    other_hand: str | None = None
    launch_speed: float | None = None
    launch_angle: float | None = None
    distance: float | None = None


class AskSummary(BaseModel):
    total: int
    denom: int
    home: int
    road: int
    vs_lhp: int
    vs_rhp: int
    games: int
    first_date: date | None = None
    last_date: date | None = None


class AskResponse(BaseModel):
    query: str
    query_type: str              # player_stat | comparative | team_stat
    answer: AskAnswer | None = None
    comparison: list[AskLeader | AskAnswer] = []
    game_log: list[AskGame] = []
    truncated: bool = False
    summary_stats: AskSummary | None = None
    notes: list[str] = []
    suggestions: list[str] = []
    data_through: date | None = None


class PitchShare(BaseModel):
    pitch_type: str
    pct: float | None = None


class Matchup(BaseModel):
    """One batter's pitch-level line against one pitcher. Rates with no
    denominator (never swung, never put it in play) are None, not 0."""
    batter: int
    pitches: int
    pa: int
    whiff_pct: float | None = None     # whiffs / swings
    avg_ev: float | None = None        # mph, batted balls
    hard_hit_pct: float | None = None  # 95+ mph / batted balls
    xwoba: float | None = None
    mix: list[PitchShare] = []         # most-seen pitch types, top first
