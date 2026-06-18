-- ============================================================
-- 002_youtube_metadata.sql
-- youtube_transcripts에 메타데이터 컬럼 추가 + 백필 + 검색 함수 교체
-- 롤백: 002_youtube_metadata_rollback.sql
-- ============================================================

-- 1. 컬럼 추가
ALTER TABLE youtube_transcripts
  ADD COLUMN IF NOT EXISTS channel_name text,
  ADD COLUMN IF NOT EXISTS video_url    text,
  ADD COLUMN IF NOT EXISTS language     text,
  ADD COLUMN IF NOT EXISTS published_at timestamptz;

-- 2. channel_name / video_url / published_at 백필
--    youtube_videos → youtube_channels JOIN으로 끌어옴
--    published_at이 NULL인 youtube_videos row는 그대로 NULL 유지
UPDATE youtube_transcripts t
SET
  channel_name = c.channel_name,
  video_url    = 'https://youtube.com/watch?v=' || t.video_id,
  published_at = v.published_at
FROM youtube_videos v
JOIN youtube_channels c ON c.channel_id = v.channel_id
WHERE t.video_id = v.video_id;

-- 3. language 백필 (채널명 기준 분류)
--    등록된 영어 채널이 생기면 ILIKE 조건에 채널명 추가 후 재실행
UPDATE youtube_transcripts t
SET language = CASE
  WHEN c.channel_name ILIKE '%damodaran%'
    OR c.channel_name ILIKE '%plain bagel%'
    OR c.channel_name ILIKE '%patrick boyle%'
  THEN 'en'
  ELSE 'ko'
END
FROM youtube_videos v
JOIN youtube_channels c ON c.channel_id = v.channel_id
WHERE t.video_id = v.video_id;

-- 4. 기존 검색 함수 제거 후 신규 함수로 교체
DROP FUNCTION IF EXISTS search_youtube_transcripts(vector, float, int);

CREATE OR REPLACE FUNCTION search_youtube_transcripts(
  query_embedding  vector(1536),
  match_threshold  float   DEFAULT 0.5,
  match_count      int     DEFAULT 5,
  recency_weight   float   DEFAULT 0.15
)
RETURNS TABLE (
  video_title   text,
  channel_name  text,
  video_url     text,
  language      text,
  published_at  timestamptz,
  chunk_text    text,
  similarity    float,
  final_score   float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    t.video_title,
    t.channel_name,
    t.video_url,
    t.language,
    t.published_at,
    t.chunk_text,
    1 - (t.embedding <=> query_embedding)                          AS similarity,
    (1 - (t.embedding <=> query_embedding))
      + recency_weight * (
          1.0 / (1.0 + COALESCE(
            EXTRACT(EPOCH FROM (NOW() - t.published_at)) / 86400.0 / 365.0,
            999.0   -- published_at NULL이면 최신성 보너스 0에 수렴
          ))
        )                                                          AS final_score
  FROM youtube_transcripts t
  WHERE 1 - (t.embedding <=> query_embedding) > match_threshold
  ORDER BY final_score DESC
  LIMIT match_count;
$$;
