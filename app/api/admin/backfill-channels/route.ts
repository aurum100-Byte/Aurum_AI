import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { ytFetch } from "@/lib/youtubeIngest";

export const maxDuration = 60;

/**
 * 일회성 백필: 기존에 인제스트된 채널들에 uploads_playlist_id / last_synced_video_at을 채운다.
 * 실행: curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/admin/backfill-channels
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

  const { data: channels, error } = await supabase
    .from("youtube_channels")
    .select("channel_id, channel_name, channel_url")
    .is("uploads_playlist_id", null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!channels || channels.length === 0) {
    return NextResponse.json({ message: "백필할 채널 없음", updated: [] });
  }

  const updated: Array<{ channelId: string; channelName: string; uploadsPlaylistId: string; lastSyncedVideoAt: string | null }> = [];
  const errors: Array<{ channelId: string; error: string }> = [];

  for (const ch of channels) {
    try {
      const channelData = (await ytFetch(
        `/channels?part=contentDetails&id=${encodeURIComponent(ch.channel_id)}`
      )) as { items?: Array<{ contentDetails: { relatedPlaylists: { uploads: string } } }> };

      const uploadsPlaylistId = channelData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
      if (!uploadsPlaylistId) {
        errors.push({ channelId: ch.channel_id, error: "uploads playlist를 찾을 수 없음" });
        continue;
      }

      const { data: videoRows } = await supabase
        .from("youtube_videos")
        .select("published_at")
        .eq("channel_id", ch.channel_id);

      const lastSyncedVideoAt = (videoRows || [])
        .map((v) => v.published_at)
        .filter((v): v is string => !!v)
        .sort()
        .pop() || null;

      const { error: upsertError } = await supabase
        .from("youtube_channels")
        .upsert(
          {
            channel_id: ch.channel_id,
            channel_name: ch.channel_name,
            channel_url: ch.channel_url,
            uploads_playlist_id: uploadsPlaylistId,
            last_synced_video_at: lastSyncedVideoAt,
            is_active: true,
          },
          { onConflict: "channel_id" }
        );

      if (upsertError) {
        errors.push({ channelId: ch.channel_id, error: upsertError.message });
        continue;
      }

      updated.push({ channelId: ch.channel_id, channelName: ch.channel_name, uploadsPlaylistId, lastSyncedVideoAt });
    } catch (err) {
      errors.push({ channelId: ch.channel_id, error: err instanceof Error ? err.message : "알 수 없는 오류" });
    }
  }

  return NextResponse.json({ updated, errors });
}
