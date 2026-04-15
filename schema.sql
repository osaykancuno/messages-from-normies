-- Run this in the Supabase SQL Editor (supabase.com > your project > SQL Editor)

CREATE TABLE blocks (
  id BIGSERIAL PRIMARY KEY,
  normie_id INTEGER NOT NULL UNIQUE,
  message TEXT NOT NULL CHECK (char_length(message) <= 100),
  edit_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable Row Level Security. No policies are defined, so public (anon) access
-- is denied entirely. The Node server must use the SERVICE_ROLE key, which
-- bypasses RLS, and is the sole gateway to this table — all access control
-- (rate limiting, validation, edit limits) is enforced in server.js.
ALTER TABLE blocks ENABLE ROW LEVEL SECURITY;

-- Index for fast lookups by normie_id
CREATE INDEX idx_blocks_normie_id ON blocks (normie_id);

-- Index for sorting by creation date
CREATE INDEX idx_blocks_created_at ON blocks (created_at DESC);
