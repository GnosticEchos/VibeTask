-- Enable PostgreSQL extensions for full-text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Add search_vector column for full-text search
ALTER TABLE "ProjectDocument" ADD COLUMN IF NOT EXISTS "searchVector" tsvector
GENERATED ALWAYS AS (
  setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(content, '')), 'B')
) STORED;

-- Create GIN index for fast full-text search
CREATE INDEX IF NOT EXISTS idx_doc_search ON "ProjectDocument" USING GIN ("searchVector");

-- Create index for trigram similarity searches (optional, for prefix matching)
CREATE INDEX IF NOT EXISTS idx_doc_title_trgm ON "ProjectDocument" USING GIN (title gin_trgm_ops);
