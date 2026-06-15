import { NextRequest } from "next/server";
import { google } from "googleapis";
import { YoutubeTranscript } from "youtube-transcript";
import OpenAI from "openai";
import { supabase } from "@/lib/supabase";

export const maxDuration = 60;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function parseChannelUrl(url: string): { channelId?: string; handle?: string } {
  const trimmed = url.trim();
  if (trimmed.startsWith("@")) return { handle: trimmed.slice(1) };
  const handleMatch = trimmed.match(/@([^/?&\s]+)/);
  if (handleMatch) return { handle: handleMatch[1] };
  const channelIdMatch = trimmed.match(/channel\/([^/?&\s]+)/);
  if (channelIdMatch) return { channelId: channelIdMatch[1] };
  throw new Error("지원하지 않는 URL 형식이야. @handle 또는 /channel/ID 형태로 입력해줘.");
}

function chunkText(text: string, size = 500, overlap = 50): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    chunks.push(text.slice(start, Math.min(start + size, text.length)));
    start += size - overlap;
  }
  return chunks.filter((c) => c.trim().length > 30);
}

async function embedChunks(chunks: string[]): Promise<number[][]> {
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

export async function POST(req: NextRequest): Promise<Response> {
  const { channelUrl } = await req.json();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        if (!process.env.YOUTUBE_API_KEY) throw new Error("YOUTUBE_API_KEY가 설정되지 않았어.");
        if (!supabase) throw new Error("Supabase가 설정되지 않았어.");

        const youtube = google.youtube({ version: "v3", auth: process.env.YOUTUBE_API_KEY });
        const parsed = parseChannelUrl(channelUrl);

        send({ type: "status", message: "채널 정보 확인 중..." });

        const channelRes = await youtube.channels.list({
          part: ["contentDetails", "snippet"],
          ...(parsed.handle ? { forHandle: parsed.handle } : { id: [parsed.channelId!] }),
        });

        const channel = channelRes.data.items?.[0];
        if (!channel) throw new Error("채널을 찾을 수 없어.");

        const channelId = channel.id!;
        const channelName = channel.snippet?.title || "알 수 없음";
        const uploadsPlaylistId = channel.contentDetails?.relatedPlaylists?.uploads;
        if (!uploadsPlaylistId) throw new Error("업로드 플레이리스트를 찾을 수 없어.");

        await supabase.from("youtube_channels").upsert(
          { channel_id: channelId, channel_name: channelName, channel_url: channelUrl },
          { onConflict: "channel_id" }
        );

        send({ type: "status", message: "영상 목록 수집 중..." });

        type VideoItem = { videoId: string; title: string; publishedAt: string };
        const videos: VideoItem[] = [];
        let pageToken: string | undefined;

        do {
          const playlistRes = await youtube.playlistItems.list({
            part: ["contentDetails", "snippet"],
            playlistId: uploadsPlaylistId,
            maxResults: 50,
            pageToken,
          });
          for (const item of playlistRes.data.items || []) {
            const videoId = item.contentDetails?.videoId;
            const title = item.snippet?.title;
            if (videoId && title) {
              videos.push({ videoId, title, publishedAt: item.snippet?.publishedAt || "" });
            }
          }
          pageToken = playlistRes.data.nextPageToken || undefined;
        } while (pageToken);

        send({ type: "status", message: `총 ${videos.length}개 영상 발견. 처리 시작...`, total: videos.length });

        let processed = 0, skipped = 0, failed = 0;

        for (const { videoId, title, publishedAt } of videos) {
          const { data: existing } = await supabase
            .from("youtube_videos")
            .select("video_id")
            .eq("video_id", videoId)
            .maybeSingle();

          if (existing) {
            skipped++;
            send({ type: "progress", current: processed + skipped + failed, total: videos.length, message: `[스킵] ${title}` });
            continue;
          }

          try {
            const transcriptArr = await YoutubeTranscript.fetchTranscript(videoId);
            const fullText = transcriptArr.map((t) => t.text).join(" ").replace(/\s+/g, " ").trim();
            if (!fullText) throw new Error("자막 없음");

            const chunks = chunkText(fullText);
            const embeddings = await embedChunks(chunks);

            await supabase.from("youtube_transcripts").insert(
              chunks.map((chunk, idx) => ({
                video_id: videoId,
                video_title: title,
                chunk_text: chunk,
                embedding: embeddings[idx],
                chunk_index: idx,
              }))
            );

            await supabase.from("youtube_videos").upsert(
              { channel_id: channelId, video_id: videoId, title, published_at: publishedAt || null },
              { onConflict: "video_id" }
            );

            processed++;
            send({ type: "progress", current: processed + skipped + failed, total: videos.length, message: `[완료] ${title}` });
          } catch {
            failed++;
            send({ type: "progress", current: processed + skipped + failed, total: videos.length, message: `[자막없음] ${title}` });
          }

          await new Promise((r) => setTimeout(r, 300));
        }

        await supabase
          .from("youtube_channels")
          .update({ video_count: processed })
          .eq("channel_id", channelId);

        send({
          type: "done",
          message: `완료! ${processed}개 처리 / ${skipped}개 이미 됨 / ${failed}개 자막없음`,
          processed, skipped, failed,
        });
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : "알 수 없는 오류" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
