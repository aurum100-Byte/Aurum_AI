import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import {
  parseChannelUrl,
  ytFetch,
  ingestVideo,
  type VideoItem,
} from "@/lib/youtubeIngest";

export const maxDuration = 60;

// ── 1단계: 채널 스캔 ─────────────────────────────────────────────────
async function handleScan(channelUrl: string): Promise<Response> {
  try {
    if (!process.env.YOUTUBE_API_KEY)
      return NextResponse.json({ error: "YOUTUBE_API_KEY가 설정되지 않았어." }, { status: 500 });
    if (!supabase)
      return NextResponse.json({ error: "Supabase가 설정되지 않았어." }, { status: 500 });

    const parsed = parseChannelUrl(channelUrl);

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

    await supabase.from("youtube_channels").upsert(
      {
        channel_id: channelId,
        channel_name: channelName,
        channel_url: channelUrl,
        uploads_playlist_id: uploadsPlaylistId,
        is_active: true,
      },
      { onConflict: "channel_id" }
    );

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

        for (const video of videos) {
          const { videoId, title } = video;
          // 자막이 이미 저장된 영상만 스킵 (youtube_videos 기준이면 자막 없는 영상도 스킵돼서 버그)
          const { count: transcriptCount } = await supabase!
            .from("youtube_transcripts")
            .select("id", { count: "exact", head: true })
            .eq("video_id", videoId);

          if (transcriptCount && transcriptCount > 0) {
            skipped++;
            send({
              type: "progress",
              current: processedSoFar + processed + skipped + failed,
              total: totalCount,
              message: `[스킵] ${title}`,
            });
            continue;
          }

          const result = await ingestVideo(channelId, channelName, video);

          if (result.status === "saved") {
            processed++;
            send({
              type: "progress",
              current: processedSoFar + processed + skipped + failed,
              total: totalCount,
              message: `[완료] ${title} (${result.language})`,
            });
          } else {
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
          const { data: videoRows } = await supabase!
            .from("youtube_videos")
            .select("video_id, published_at")
            .eq("channel_id", channelId);

          const videoCount = videoRows?.length ?? 0;
          const lastSyncedVideoAt = (videoRows || [])
            .map((v) => v.published_at)
            .filter((v): v is string => !!v)
            .sort()
            .pop();

          await supabase!
            .from("youtube_channels")
            .update({
              video_count: videoCount,
              last_synced_at: new Date().toISOString(),
              last_synced_video_at: lastSyncedVideoAt || null,
            })
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
