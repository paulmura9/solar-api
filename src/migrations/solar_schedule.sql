-- Run once in Supabase SQL editor to create the solar_schedule table.

CREATE TABLE IF NOT EXISTS solar_schedule (
  id             BIGSERIAL PRIMARY KEY,
  date           DATE        UNIQUE NOT NULL,
  sunrise        TIME        NOT NULL,
  sunset         TIME        NOT NULL,
  daylight_hours NUMERIC(4,2),
  latitude       NUMERIC(10,6),
  longitude      NUMERIC(10,6),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS solar_schedule_date_idx ON solar_schedule (date);
