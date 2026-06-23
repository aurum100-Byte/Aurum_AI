-- ============================================================
-- 003_channel_tracking.sql
-- youtube_channels에 자동 추적 동기화용 컬럼 추가
-- (별도 tracked_channels 테이블을 만들지 않고 기존 youtube_channels를
--  source of truth로 확장: channel_id가 이미 unique key로 존재함)
-- ============================================================

ALTER TABLE youtube_channels
  ADD COLUMN IF NOT EXISTS uploads_playlist_id  text,
  ADD COLUMN IF NOT EXISTS is_active             boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_synced_at        timestamptz,
  ADD COLUMN IF NOT EXISTS last_synced_video_at  timestamptz;

CREATE INDEX IF NOT EXISTS idx_youtube_channels_active ON youtube_channels(is_active);
