import { YoutubeTranscript } from "youtube-transcript";
import OpenAI from "openai";
import { supabase } from "./supabase";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export type VideoItem = { videoId: string; title: string; publishedAt: string };

export function parseChannelUrl(url: string): { channelId?: string; handle?: string } {
  const trimmed = url.trim();
  if (trimmed.startsWith("@")) return { handle: trimmed.slice(1) };
  const handleMatch = trimmed.match(/@([^/?&\s]+)/);
  if (handleMatch) return { handle: handleMatch[1] };
  const channelIdMatch = trimmed.match(/channel\/([^/?&\s]+)/);
  if (channelIdMatch) return { channelId: channelIdMatch[1] };
  throw new Error("지원하지 않는 URL 형식. @handle 또는 /channel/ID 형태로 입력해줘.");
}

export function chunkText(text: string, size = 500, overlap = 50): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    chunks.push(text.slice(start, Math.min(start + size, text.length)));
    start += size - overlap;
  }
  return chunks.filter((c) => c.trim().length > 30);
}

export async function embedChunks(chunks: string[]): Promise<number[][]> {
  const BATCH = 100;
  const all: number[][] = [];
  for (let i = 0; i < chunks.length; i += BATCH) {
    const res = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: chunks.slice(i, i + BATCH),
    });
    all.push(...res.data.map((d) => d.embedding));
  }
  return all;
}

// 자막 언어 감지: ko → en → 기본값 순으로 시도
export async function fetchTranscriptWithLang(
  videoId: string
): Promise<{ text: string; language: string }> {
  const attempts: Array<{ lang: string; label: string }> = [
    { lang: "ko", label: "ko" },
    { lang: "en", label: "en" },
  ];
  for (const { lang, label } of attempts) {
    try {
      const arr = await YoutubeTranscript.fetchTranscript(videoId, { lang });
      const text = arr.map((t) => t.text).join(" ").replace(/\s+/g, " ").trim();
      if (text) return { text, language: label };
    } catch {
      // 다음 언어 시도
    }
  }
  // 언어 지정 없이 마지막 시도
  const arr = await YoutubeTranscript.fetchTranscript(videoId);
  const text = arr.map((t) => t.text).join(" ").replace(/\s+/g, " ").trim();
  if (!text) throw new Error("자막 없음");
  return { text, language: "unknown" };
}

export async function ytFetch(path: string): Promise<Record<string, unknown>> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  const res = await fetch(`https://www.googleapis.com/youtube/v3${path}&key=${apiKey}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: { message?: string } }).error?.message || `YouTube API 오류 ${res.status}`);
  }
  return res.json();
}

export type IngestVideoResult =
  | { status: "saved"; language: string; chunkCount: number }
  | { status: "no_transcript" };

/**
 * 자막 fetch → chunk → embedding → youtube_transcripts/youtube_videos 저장까지
 * 하나의 영상에 대한 전체 인제스트 파이프라인. 스캔/배치 인제스트와 자동 동기화 양쪽에서 재사용.
 */
export async function ingestVideo(
  channelId: string,
  channelName: string,
  video: VideoItem
): Promise<IngestVideoResult> {
  if (!supabase) throw new Error("Supabase가 설정되지 않았어.");
  const { videoId, title, publishedAt } = video;

  try {
    const { text: fullText, language } = await fetchTranscriptWithLang(videoId);
    const chunks = chunkText(fullText);
    const embeddings = await embedChunks(chunks);

    await supabase.from("youtube_transcripts").insert(
      chunks.map((chunk, idx) => ({
        video_id: videoId,
        video_title: title,
        chunk_text: chunk,
        embedding: embeddings[idx],
        chunk_index: idx,
        channel_name: channelName,
        video_url: `https://youtube.com/watch?v=${videoId}`,
        language,
        published_at: publishedAt || null,
      }))
    );

    await supabase.from("youtube_videos").upsert(
      { channel_id: channelId, video_id: videoId, title, published_at: publishedAt || null },
      { onConflict: "video_id" }
    );

    return { status: "saved", language, chunkCount: chunks.length };
  } catch {
    return { status: "no_transcript" };
  }
}
