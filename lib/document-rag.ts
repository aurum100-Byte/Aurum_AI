import OpenAI from "openai";
import { supabase } from "./supabase";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type DocSearchResult = {
  file_name: string;
  summary: string;
  objective_data: string;
  subjective_opinion: string;
  ai_opinion: string;
  tags: string[] | null;
  created_at: string;
  similarity: number;
};

/**
 * "최근 5개만 참고" 제한 없이, 질문과 관련된 리서치 문서를 전체에서 검색한다.
 */
export async function searchDocumentContext(query: string): Promise<string> {
  if (!supabase || !query.trim()) return "";

  try {
    const embeddingRes = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: query,
    });
    const queryEmbedding = embeddingRes.data[0].embedding;

    const { data, error } = await supabase.rpc("search_documents", {
      query_embedding: queryEmbedding,
      match_threshold: 0.3,
      match_count: 5,
    });

    if (error || !data || data.length === 0) return "";

    return (
      "\n\n### 저장된 리서치 문서 (질문과 관련된 자료)\n" +
      (data as DocSearchResult[])
        .map((d) => {
          const date = new Date(d.created_at).toLocaleDateString("ko-KR");
          return (
            `[${d.file_name}] (${date})\n` +
            `태그: ${d.tags?.join(", ") || "-"}\n` +
            `요약: ${d.summary || "-"}\n` +
            `팩트: ${d.objective_data || "-"}\n` +
            `작성자 의견: ${d.subjective_opinion || "-"}\n` +
            `AI 의견: ${d.ai_opinion || "-"}`
          );
        })
        .join("\n\n")
    );
  } catch {
    return "";
  }
}
