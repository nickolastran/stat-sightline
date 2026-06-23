-- =====================================================================
-- Stat Sightline — Phase 2 Feature Views
-- Barrels, Attack Zones (Heart/Shadow/Chase/Waste) + Swing/Take run values
-- Depends on: sql/01_schema.sql  (schema "savant")
-- =====================================================================
SET search_path TO savant, public;

-- ---------------------------------------------------------------------
-- 1) Batted balls + Barrel classification
-- ---------------------------------------------------------------------
-- Barrel definition (Statcast): EV >= 98 mph, and the EV/LA combination
-- falls inside the barrel band. At 98 mph the band is LA 26-30; it widens
-- ~1 degree per side for every additional mph. The two linear inequalities
-- below reproduce that band exactly (anchor: 98 mph -> 26-30 deg).
CREATE OR REPLACE VIEW v_batted_balls AS
SELECT
    pitch_id, game_pk, game_date, batter, pitcher, pitch_type,
    launch_speed, launch_angle, bb_type, events,
    estimated_woba_using_speedangle,
    woba_value, woba_denom,
    (
        launch_speed >= 98
        AND launch_angle BETWEEN 8 AND 50
        AND (launch_speed * 1.5 - launch_angle) >= 117
        AND (launch_speed + launch_angle)       >= 124
    ) AS is_barrel,
    (launch_speed >= 95)                         AS is_hard_hit  -- Hard-Hit% = 95+ mph
FROM pitches
WHERE description = 'hit_into_play'
  AND launch_speed IS NOT NULL
  AND launch_angle IS NOT NULL;

-- Per-batter barrel & hard-hit rates (Savant "Barrel %" = Brls / BBE).
CREATE OR REPLACE VIEW v_player_barrels AS
SELECT
    batter AS player_id,
    COUNT(*)                               AS batted_balls,
    COUNT(*) FILTER (WHERE is_barrel)      AS barrels,
    COUNT(*) FILTER (WHERE is_hard_hit)    AS hard_hits,
    ROUND(AVG(launch_speed)::numeric, 1)   AS avg_exit_velocity,
    ROUND(100.0 * COUNT(*) FILTER (WHERE is_barrel)   / NULLIF(COUNT(*), 0), 1) AS barrel_pct,
    ROUND(100.0 * COUNT(*) FILTER (WHERE is_hard_hit) / NULLIF(COUNT(*), 0), 1) AS hard_hit_pct
FROM v_batted_balls
GROUP BY batter;

-- ---------------------------------------------------------------------
-- 2) Attack Zones + Swing/Take decision + run value
-- ---------------------------------------------------------------------
-- Normalize each pitch location into "zone units" where |x|<=1 and |z|<=1
-- is the rulebook strike zone (half-width 0.83 ft; vertical from the
-- batter-specific sz_bot..sz_top). r = how far outside the zone center.
--   Heart  : r <= 0.67   (core of the zone)
--   Shadow : r <= 1.33   (straddles the edge, ~one ball in/out)
--   Chase  : r <= 2.00   (just off the plate)
--   Waste  : r  > 2.00   (well outside)
-- delta_run_exp is the run value the pitch added, from the batting team's
-- perspective (positive = good for the hitter).
CREATE OR REPLACE VIEW v_attack_zones AS
WITH base AS (
    SELECT
        pitch_id, game_pk, game_date, batter, pitcher, pitch_type,
        plate_x, plate_z, sz_top, sz_bot, description, delta_run_exp,
        (sz_top + sz_bot) / 2.0                      AS sz_mid,
        GREATEST((sz_top - sz_bot) / 2.0, 0.01)      AS sz_half
    FROM pitches
    WHERE plate_x IS NOT NULL AND plate_z IS NOT NULL
      AND sz_top  IS NOT NULL AND sz_bot  IS NOT NULL
),
normed AS (
    SELECT *,
        GREATEST(
            ABS(plate_x) / 0.83,
            ABS(plate_z - sz_mid) / sz_half
        ) AS r
    FROM base
)
SELECT
    pitch_id, game_pk, game_date, batter, pitcher, pitch_type, description,
    delta_run_exp AS run_value,
    CASE
        WHEN r <= 0.67 THEN 'Heart'
        WHEN r <= 1.33 THEN 'Shadow'
        WHEN r <= 2.00 THEN 'Chase'
        ELSE 'Waste'
    END AS attack_zone,
    (description IN (
        'hit_into_play','foul','foul_tip','foul_bunt','bunt_foul_tip',
        'swinging_strike','swinging_strike_blocked','missed_bunt'
    )) AS is_swing
FROM normed;

-- Per-batter swing/take run value by zone (Savant Swing/Take leaderboard).
CREATE OR REPLACE VIEW v_player_swing_take AS
SELECT
    batter AS player_id,
    attack_zone,
    CASE WHEN is_swing THEN 'Swing' ELSE 'Take' END AS decision,
    COUNT(*)                                          AS pitches,
    ROUND(SUM(run_value)::numeric, 2)                 AS run_value,
    ROUND((100.0 * SUM(run_value) / NULLIF(COUNT(*), 0))::numeric, 2) AS run_value_per_100
FROM v_attack_zones
GROUP BY batter, attack_zone, is_swing;
