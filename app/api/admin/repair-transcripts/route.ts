import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { ingestVideo } from "@/lib/youtubeIngest";

export const maxDuration = 60;

/**
 * 일회성 복구: youtube_videos에는 등록됐지만 youtube_transcripts가 비어있는 영상들을
 * (FK 순서 버그로 자막 저장이 항상 실패했던 영상들) 다시 처리한다.
 * 실행: curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/admin/repair-transcripts
 */
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!supabase) {
    return NextResponse.json({ error: "Supabase가 설정되지 않았어." }, { status: 500 });
  }

  const { data: channels } = await supabase
    .from("youtube_channels")
    .select("channel_id, channel_name");
  const channelNameById = new Map((channels || []).map((c) => [c.channel_id, c.channel_name]));

  // youtube_transcripts에 이미 있는 video_id 집합
  const transcribedIds = new Set<string>();
  {
    const PAGE = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("youtube_transcripts")
        .select("video_id")
        .range(from, from + PAGE - 1);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if (!data || data.length === 0) break;
      for (const row of data) transcribedIds.add(row.video_id);
      if (data.length < PAGE) break;
      from += PAGE;
    }
  }

  // youtube_videos 전체 (자막 없는 것만 골라낼 후보)
  const allVideos: Array<{ video_id: string; title: string; published_at: string | null; channel_id: string }> = [];
  {
    const PAGE = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("youtube_videos")
        .select("video_id, title, published_at, channel_id")
        .range(from, from + PAGE - 1);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if (!data || data.length === 0) break;
      allVideos.push(...data);
      if (data.length < PAGE) break;
      from += PAGE;
    }
  }

  const pending = allVideos.filter((v) => !transcribedIds.has(v.video_id));

  let saved = 0;
  let noTranscript = 0;
  let savedChunks = 0;
  const errors: Array<{ videoId: string; channelId: string }> = [];

  for (const video of pending) {
    const channelName = channelNameById.get(video.channel_id);
    if (!channelName) {
      errors.push({ videoId: video.video_id, channelId: video.channel_id });
      continue;
    }

    const result = await ingestVideo(video.channel_id, channelName, {
      videoId: video.video_id,
      title: video.title,
      publishedAt: video.published_at || "",
    });

    if (result.status === "saved") {
      saved++;
      savedChunks += result.chunkCount;
    } else {
      noTranscript++;
    }

    await new Promise((r) => setTimeout(r, 80));
  }

  return NextResponse.json({
    totalPending: pending.length,
    saved,
    savedChunks,
    noTranscript,
    errors,
  });
}
