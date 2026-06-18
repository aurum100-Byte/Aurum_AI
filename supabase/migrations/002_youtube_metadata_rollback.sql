-- ============================================================
-- 002_youtube_metadata_rollback.sql
-- 002_youtube_metadata.sql 완전 롤백
-- ============================================================

-- 1. 신규 함수 제거
DROP FUNCTION IF EXISTS search_youtube_transcripts(vector, float, int, float);

-- 2. 원래 검색 함수 복원
CREATE OR REPLACE FUNCTION search_youtube_transcripts(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count     int   DEFAULT 5
)
RETURNS TABLE (
  video_title text,
  chunk_text  text,
  similarity  float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    video_title,
    chunk_text,
    1 - (embedding <=> query_embedding) AS similarity
  FROM youtube_transcripts
  WHERE 1 - (embedding <=> query_embedding) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
$$;

-- 3. 추가한 컬럼 제거
ALTER TABLE youtube_transcripts
  DROP COLUMN IF EXISTS channel_name,
  DROP COLUMN IF EXISTS video_url,
  DROP COLUMN IF EXISTS language,
  DROP COLUMN IF EXISTS published_at;
