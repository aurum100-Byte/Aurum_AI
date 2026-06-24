-- ============================================================
-- 004_document_search.sql
-- documents 테이블에 임베딩 컬럼 추가 + 벡터 검색 함수
-- "최근 5개만 참고" 제한을 없애고, 질문과 관련된 문서를 전체에서 검색하도록 함
-- ============================================================

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS embedding vector(1536);

CREATE INDEX IF NOT EXISTS documents_embedding_idx
  ON documents
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE OR REPLACE FUNCTION search_documents(
  query_embedding  vector(1536),
  match_threshold  float DEFAULT 0.3,
  match_count      int   DEFAULT 5
)
RETURNS TABLE (
  id                 uuid,
  file_name          text,
  summary            text,
  objective_data     text,
  subjective_opinion text,
  ai_opinion         text,
  tags               text[],
  created_at         timestamptz,
  similarity         float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    d.id,
    d.file_name,
    d.summary,
    d.objective_data,
    d.subjective_opinion,
    d.ai_opinion,
    d.tags,
    d.created_at,
    1 - (d.embedding <=> query_embedding) AS similarity
  FROM documents d
  WHERE d.embedding IS NOT NULL
    AND 1 - (d.embedding <=> query_embedding) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
$$;
