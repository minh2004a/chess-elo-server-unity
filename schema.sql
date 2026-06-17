-- Chess ELO schema. Designed so login methods can be added later
-- WITHOUT losing ratings: rating lives on `players.id`, while `auth_identities`
-- maps any login method (device now; google/email later) to that player id.

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- for gen_random_uuid() on older PG

CREATE TABLE IF NOT EXISTS players (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name TEXT NOT NULL DEFAULT 'Player',
  rating       INTEGER NOT NULL DEFAULT 1000,
  games        INTEGER NOT NULL DEFAULT 0,
  wins         INTEGER NOT NULL DEFAULT 0,
  losses       INTEGER NOT NULL DEFAULT 0,
  draws        INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per login method. MVP only inserts provider='device'.
-- Later: INSERT a row with provider='google'/'email' and the SAME player_id
-- to link an account to an existing (anonymous) player -> rating is kept.
CREATE TABLE IF NOT EXISTS auth_identities (
  provider      TEXT NOT NULL,            -- 'device' | 'google' | 'email' ...
  external_id   TEXT NOT NULL,            -- device guid / google sub / email
  password_hash TEXT,                     -- only for provider='email'
  player_id     UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, external_id)
);

-- Processed matches. PRIMARY KEY(match_id) makes rating updates idempotent:
-- the same match can be reported twice (both clients) but only counts once.
CREATE TABLE IF NOT EXISTS matches (
  match_id            TEXT PRIMARY KEY,
  white_id            UUID NOT NULL REFERENCES players(id),
  black_id            UUID NOT NULL REFERENCES players(id),
  result              TEXT NOT NULL CHECK (result IN ('white_win','black_win','draw')),
  white_rating_before INTEGER NOT NULL,
  black_rating_before INTEGER NOT NULL,
  white_rating_after  INTEGER NOT NULL,
  black_rating_after  INTEGER NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_players_rating ON players(rating DESC);
