import OpenAI from "openai";
import { supabase } from "./supabase";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
      match_threshold: 0.7,
      match_count: 5,
    });

    if (error || !data || data.length === 0) return "";

    return (
      "\n\n### 📺 관련 유튜브 내용 (저장된 채널 영상 기반)\n" +
      (data as { video_title: string; chunk_text: string }[])
        .map((item) => `[${item.video_title}]\n${item.chunk_text}`)
        .join("\n\n")
    );
  } catch {
    return "";
  }
}
