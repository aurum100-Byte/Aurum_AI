import { NextRequest, NextResponse } from "next/server";
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
  throw new Error("지원하지 않는 URL 형식. @handle 또는 /channel/ID 형태로 입력해줘.");
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

type VideoItem = { videoId: string; title: string; publishedAt: string };

async function ytFetch(path: string): Promise<Record<string, unknown>> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  const res = await fetch(`https://www.googleapis.com/youtube/v3${path}&key=${apiKey}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: { message?: string } }).error?.message || `YouTube API 오류 ${res.status}`);
  }
  return res.json();
}

// ── 1단계: 채널 스캔 ─────────────────────────────────────────────────
async function handleScan(channelUrl: string): Promise<Response> {
  try {
    if (!process.env.YOUTUBE_API_KEY)
      return NextResponse.json({ error: "YOUTUBE_API_KEY가 설정되지 않았어." }, { status: 500 });
    if (!supabase)
      return NextResponse.json({ error: "Supabase가 설정되지 않았어." }, { status: 500 });

    const parsed = parseChannelUrl(channelUrl);

    // 채널 정보 조회
    const channelQuery = parsed.handle
      ? `/channels?part=contentDetails,snippet&forHandle=${encodeURIComponent(parsed.handle)}`
      : `/channels?part=contentDetails,snippet&id=${encodeURIComponent(parsed.channelId!)}`;

    const channelData = await ytFetch(channelQuery) as {
      items?: Array<{
        id: string;
        snippet: { title: string };
        contentDetails: { relatedPlaylists: { uploads: string } };
      }>;
    };

    const channel = channelData.items?.[0];
    if (!channel) return NextResponse.json({ error: "채널을 찾을 수 없어." }, { status: 404 });

    const channelId = channel.id;
    const channelName = channel.snippet.title;
    const uploadsPlaylistId = channel.contentDetails.relatedPlaylists.uploads;

    // 채널 저장
    await supabase.from("youtube_channels").upsert(
      { channel_id: channelId, channel_name: channelName, channel_url: channelUrl },
      { onConflict: "channel_id" }
    );

    // 전체 영상 목록 수집
    const videos: VideoItem[] = [];
    let pageToken: string | undefined;

    do {
      const pageParam = pageToken ? `&pageToken=${pageToken}` : "";
      const listData = await ytFetch(
        `/playlistItems?part=contentDetails,snippet&playlistId=${uploadsPlaylistId}&maxResults=50${pageParam}`
      ) as {
        items?: Array<{
          contentDetails: { videoId: string };
          snippet: { title: string; publishedAt: string };
        }>;
        nextPageToken?: string;
      };

      for (const item of listData.items || []) {
        const videoId = item.contentDetails?.videoId;
        const title = item.snippet?.title;
        if (videoId && title) {
          videos.push({ videoId, title, publishedAt: item.snippet?.publishedAt || "" });
        }
      }
      pageToken = listData.nextPageToken;
    } while (pageToken);

    return NextResponse.json({ channelId, channelName, videos });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "스캔 중 오류 발생" },
      { status: 500 }
    );
  }
}

// ── 2단계: 배치 처리 ─────────────────────────────────────────────────
async function handleProcess(body: {
  channelId: string;
  channelName: string;
  channelUrl: string;
  videos: VideoItem[];
  isLast: boolean;
  totalCount: number;
  processedSoFar: number;
}): Promise<Response> {
  const { channelId, channelName, videos, isLast, totalCount, processedSoFar } = body;

  if (!supabase) {
    return NextResponse.json({ error: "Supabase가 설정되지 않았어." }, { status: 500 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        let processed = 0, skipped = 0, failed = 0;

        for (const { videoId, title, publishedAt } of videos) {
          const { data: existing } = await supabase!
            .from("youtube_videos")
            .select("video_id")
            .eq("video_id", videoId)
            .maybeSingle();

          if (existing) {
            skipped++;
            send({
              type: "progress",
              current: processedSoFar + processed + skipped + failed,
              total: totalCount,
              message: `[스킵] ${title}`,
            });
            continue;
          }

          try {
            const transcriptArr = await YoutubeTranscript.fetchTranscript(videoId);
            const fullText = transcriptArr.map((t) => t.text).join(" ").replace(/\s+/g, " ").trim();
            if (!fullText) throw new Error("자막 없음");

            const chunks = chunkText(fullText);
            const embeddings = await embedChunks(chunks);

            await supabase!.from("youtube_transcripts").insert(
              chunks.map((chunk, idx) => ({
                video_id: videoId,
                video_title: title,
                chunk_text: chunk,
                embedding: embeddings[idx],
                chunk_index: idx,
              }))
            );

            await supabase!.from("youtube_videos").upsert(
              { channel_id: channelId, video_id: videoId, title, published_at: publishedAt || null },
              { onConflict: "video_id" }
            );

            processed++;
            send({
              type: "progress",
              current: processedSoFar + processed + skipped + failed,
              total: totalCount,
              message: `[완료] ${title}`,
            });
          } catch {
            failed++;
            send({
              type: "progress",
              current: processedSoFar + processed + skipped + failed,
              total: totalCount,
              message: `[자막없음] ${title}`,
            });
          }

          await new Promise((r) => setTimeout(r, 100));
        }

        if (isLast) {
          await supabase!
            .from("youtube_channels")
            .update({ video_count: processed })
            .eq("channel_id", channelId);

          send({ type: "done", message: `${channelName} 학습 완료!`, processed, skipped, failed });
        } else {
          send({ type: "batch-done", processed, skipped, failed });
        }
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : "처리 중 오류" });
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

export async function POST(req: NextRequest): Promise<Response> {
  const body = await req.json();
  if (body.mode === "scan") return handleScan(body.channelUrl);
  return handleProcess(body);
}
