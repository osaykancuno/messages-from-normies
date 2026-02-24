-- Run this in the Supabase SQL Editor (supabase.com > your project > SQL Editor)

CREATE TABLE blocks (
  id BIGSERIAL PRIMARY KEY,
  normie_id INTEGER NOT NULL UNIQUE,
  message TEXT NOT NULL CHECK (char_length(message) <= 100),
  edit_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Disable Row Level Security (the server handles all access control)
ALTER TABLE blocks DISABLE ROW LEVEL SECURITY;

-- Index for fast lookups by normie_id
CREATE INDEX idx_blocks_normie_id ON blocks (normie_id);

-- Index for sorting by creation date
CREATE INDEX idx_blocks_created_at ON blocks (created_at DESC);
