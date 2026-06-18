import OpenAI from "openai";
import { supabase } from "./supabase";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type SearchResult = {
  video_title: string;
  channel_name: string | null;
  video_url: string | null;
  language: string | null;
  published_at: string | null;
  chunk_text: string;
  similarity: number;
  final_score: number;
};

export async function searchYoutubeContext(query: string): Promise<string> {
  if (!supabase || !query.trim()) return "";

  try {
    const embeddingRes = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: query,
    });
    const queryEmbedding = embeddingRes.data[0].embedding;

    const { data, error } = await supabase.rpc("search_youtube_transcripts", {
      query_embedding: queryEmbedding,
      match_threshold: 0.5,   // 영어 청크 cross-lingual 검색 위해 0.7 → 0.5
      match_count: 5,
      recency_weight: 0.15,   // 최신 영상 소폭 우대
    });

    if (error || !data || data.length === 0) return "";

    return (
      "\n\n### 📺 관련 유튜브 내용 (저장된 채널 영상 기반)\n" +
      (data as SearchResult[])
        .map((item) => {
          const date = item.published_at
            ? new Date(item.published_at).toLocaleDateString("ko-KR")
            : null;
          const meta = [item.channel_name, date].filter(Boolean).join(" / ");
          return `[${meta ? meta + " / " : ""}${item.video_title}]\n${item.chunk_text}`;
        })
        .join("\n\n")
    );
  } catch {
    return "";
  }
}
