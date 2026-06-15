-- pgvector 확장
create extension if not exists vector;

-- 채널 정보
create table if not exists youtube_channels (
  id uuid default gen_random_uuid() primary key,
  channel_id text unique not null,
  channel_name text not null,
  channel_url text not null,
  video_count int default 0,
  created_at timestamp with time zone default now()
);

-- 영상 메타데이터
create table if not exists youtube_videos (
  id uuid default gen_random_uuid() primary key,
  channel_id text references youtube_channels(channel_id) on delete cascade,
  video_id text unique not null,
  title text not null,
  published_at timestamp with time zone,
  processed_at timestamp with time zone default now()
);

-- 자막 청크 + 임베딩
create table if not exists youtube_transcripts (
  id uuid default gen_random_uuid() primary key,
  video_id text references youtube_videos(video_id) on delete cascade,
  video_title text,
  chunk_text text not null,
  embedding vector(1536),
  chunk_index int,
  created_at timestamp with time zone default now()
);

-- 벡터 검색 인덱스
create index if not exists youtube_transcripts_embedding_idx
  on youtube_transcripts
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- 유사도 검색 함수
create or replace function search_youtube_transcripts(
  query_embedding vector(1536),
  match_threshold float default 0.7,
  match_count int default 5
)
returns table (
  video_title text,
  chunk_text text,
  similarity float
)
language sql stable
as $$
  select
    video_title,
    chunk_text,
    1 - (embedding <=> query_embedding) as similarity
  from youtube_transcripts
  where 1 - (embedding <=> query_embedding) > match_threshold
  order by similarity desc
  limit match_count;
$$;
