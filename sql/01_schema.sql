-- =====================================================================
-- Stat Sightline — Phase 1 Schema
-- Pitch-level Statcast warehouse for PostgreSQL (>= 13)
-- =====================================================================
-- Design notes
--   * `pitches` is a wide fact table mirroring Statcast's natural grain:
--     one row per pitch. Grain key = (game_pk, at_bat_number, pitch_number).
--   * `players` and `games` are lightweight dimensions so the dashboard
--     can resolve names/handedness/teams without scanning the fact table.
--   * Raw Statcast IDs (MLBAM) are preserved verbatim (batter, pitcher)
--     and used as FKs into `players`.
--   * Nullable everywhere a sensor value can legitimately be missing
--     (e.g. pitch tracking gaps, bat_speed only exists 2023+).
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS savant;
SET search_path TO savant, public;

-- ---------------------------------------------------------------------
-- Reference / enum-like lookup tables
-- ---------------------------------------------------------------------

-- Canonical pitch-type catalog (FF, SL, CH, ...) used for arsenal coloring.
CREATE TABLE IF NOT EXISTS pitch_types (
    pitch_type   VARCHAR(4)  PRIMARY KEY,     -- Statcast code, e.g. 'FF'
    description  TEXT NOT NULL,               -- 'Four-Seam Fastball'
    pitch_group  TEXT                         -- 'Fastball' | 'Breaking' | 'Offspeed'
);

-- ---------------------------------------------------------------------
-- Dimensions
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS players (
    player_id    INTEGER PRIMARY KEY,         -- MLBAM id (batter/pitcher key)
    full_name    TEXT,
    bats         CHAR(1) CHECK (bats  IN ('L','R','S')),  -- switch = S
    throws       CHAR(1) CHECK (throws IN ('L','R')),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS games (
    game_pk      INTEGER PRIMARY KEY,         -- MLBAM game id
    game_date    DATE NOT NULL,
    game_year    SMALLINT,
    game_type    VARCHAR(2),                  -- 'R' regular, 'F'/'D'/'L'/'W' postseason, 'S' spring
    home_team    VARCHAR(4),
    away_team    VARCHAR(4)
);

CREATE INDEX IF NOT EXISTS idx_games_date ON games (game_date);

-- ---------------------------------------------------------------------
-- Fact: one row per pitch
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS pitches (
    pitch_id            BIGSERIAL PRIMARY KEY,

    -- ---- Grain / identity --------------------------------------------
    game_pk             INTEGER NOT NULL REFERENCES games(game_pk),
    at_bat_number       SMALLINT NOT NULL,
    pitch_number        SMALLINT NOT NULL,
    game_date           DATE NOT NULL,        -- denormalized for fast range scans

    -- ---- Participants ------------------------------------------------
    batter              INTEGER REFERENCES players(player_id),
    pitcher             INTEGER REFERENCES players(player_id),
    stand               CHAR(1) CHECK (stand   IN ('L','R')),  -- batter side this PA
    p_throws            CHAR(1) CHECK (p_throws IN ('L','R')),

    -- ---- Game state --------------------------------------------------
    inning              SMALLINT,
    inning_topbot       VARCHAR(3),           -- 'Top' | 'Bot'
    balls               SMALLINT,
    strikes             SMALLINT,
    outs_when_up        SMALLINT,
    on_1b               INTEGER,              -- runner MLBAM id or NULL
    on_2b               INTEGER,
    on_3b               INTEGER,
    home_score          SMALLINT,
    away_score          SMALLINT,

    -- ---- Pitch classification & result -------------------------------
    pitch_type          VARCHAR(4) REFERENCES pitch_types(pitch_type),
    pitch_name          TEXT,
    description         TEXT,                 -- 'ball','called_strike','hit_into_play',...
    type                CHAR(1),             -- 'B' ball, 'S' strike, 'X' in play
    events              TEXT,                 -- terminal PA outcome ('single','strikeout',...)
    des                 TEXT,                 -- human-readable play description
    zone                SMALLINT,            -- Statcast 1-14 zone grid

    -- ---- Pitch physics (release & flight) ----------------------------
    release_speed       REAL,                -- mph
    effective_speed     REAL,
    release_spin_rate   REAL,                -- rpm
    spin_axis           REAL,                -- degrees (clock)
    release_extension   REAL,                -- ft
    release_pos_x       REAL,
    release_pos_y       REAL,
    release_pos_z       REAL,
    pfx_x               REAL,                -- horizontal movement, ft
    pfx_z               REAL,                -- vertical movement, ft
    plate_x             REAL,                -- horizontal location at plate, ft
    plate_z             REAL,                -- vertical location at plate, ft
    vx0                 REAL, vy0 REAL, vz0 REAL,
    ax                  REAL, ay  REAL, az  REAL,
    sz_top              REAL,                -- strike-zone top this batter, ft
    sz_bot              REAL,

    -- ---- Batted-ball tracking ----------------------------------------
    launch_speed        REAL,                -- exit velocity, mph
    launch_angle        REAL,                -- degrees
    launch_speed_angle  SMALLINT,            -- Statcast 1-6 barrel bucket
    hit_distance_sc     REAL,                -- ft
    hc_x                REAL,                -- hit coordinate (spray) — raw
    hc_y                REAL,
    bb_type             TEXT,                -- 'ground_ball','line_drive','fly_ball','popup'

    -- ---- Bat tracking (2023+) ----------------------------------------
    bat_speed           REAL,                -- mph
    swing_length        REAL,                -- ft

    -- ---- Expected / run-value metrics (Statcast-provided) ------------
    estimated_ba_using_speedangle    REAL,   -- xBA
    estimated_woba_using_speedangle  REAL,   -- xwOBA on contact
    woba_value          REAL,
    woba_denom          REAL,
    babip_value         REAL,
    iso_value           REAL,
    delta_run_exp       REAL,                -- run value of the pitch
    delta_home_win_exp  REAL,

    -- ---- Bookkeeping -------------------------------------------------
    ingested_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_pitch_grain UNIQUE (game_pk, at_bat_number, pitch_number)
);

-- ---------------------------------------------------------------------
-- Indexes tuned for the dashboard's common access paths
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_pitches_batter        ON pitches (batter);
CREATE INDEX IF NOT EXISTS idx_pitches_pitcher       ON pitches (pitcher);
CREATE INDEX IF NOT EXISTS idx_pitches_game_date     ON pitches (game_date);
CREATE INDEX IF NOT EXISTS idx_pitches_pitch_type    ON pitches (pitch_type);
-- Matchup lookups (batter vs pitcher) and arsenal-by-pitcher queries:
CREATE INDEX IF NOT EXISTS idx_pitches_bat_pit       ON pitches (batter, pitcher);
CREATE INDEX IF NOT EXISTS idx_pitches_pitcher_type  ON pitches (pitcher, pitch_type);
-- Batted-ball-only analyses (percentiles, rolling xBA) skip the nulls:
CREATE INDEX IF NOT EXISTS idx_pitches_inplay
    ON pitches (batter, game_date)
    WHERE launch_speed IS NOT NULL;

-- =====================================================================
-- Seed the pitch-type catalog (safe to re-run)
-- =====================================================================
INSERT INTO pitch_types (pitch_type, description, pitch_group) VALUES
    ('FF','Four-Seam Fastball','Fastball'),
    ('SI','Sinker','Fastball'),
    ('FC','Cutter','Fastball'),
    ('FT','Two-Seam Fastball','Fastball'),
    ('FS','Splitter','Offspeed'),
    ('CH','Changeup','Offspeed'),
    ('FO','Forkball','Offspeed'),
    ('SC','Screwball','Offspeed'),
    ('SL','Slider','Breaking'),
    ('ST','Sweeper','Breaking'),
    ('SV','Slurve','Breaking'),
    ('CU','Curveball','Breaking'),
    ('KC','Knuckle Curve','Breaking'),
    ('CS','Slow Curve','Breaking'),
    ('KN','Knuckleball','Other'),
    ('EP','Eephus','Other'),
    ('PO','Pitchout','Other'),
    ('IN','Intentional Ball','Other')
ON CONFLICT (pitch_type) DO NOTHING;
