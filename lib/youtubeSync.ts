import { supabase } from "./supabase";
import { ytFetch, ingestVideo, type VideoItem } from "./youtubeIngest";

export type TrackedChannel = {
  channel_id: string;
  channel_name: string;
  uploads_playlist_id: string | null;
  last_synced_video_at: string | null;
};

export type SyncSummary = {
  channelId: string;
  channelName: string;
  newVideos: number;
  savedChunks: number;
  skipped: number;
  errors: number;
  error?: string;
};

const NO_CHECKPOINT_FALLBACK_COUNT = 20;

/**
 * 채널의 uploads 플레이리스트를 최신순으로 훑어 last_synced_video_at 이후의
 * 새 영상만 모아온다. playlistItems.list는 호출당 1 unit (search.list의 100 unit보다 훨씬 경제적).
 */
async function fetchNewVideos(channel: TrackedChannel): Promise<VideoItem[]> {
  const checkpoint = channel.last_synced_video_at ? new Date(channel.last_synced_video_at) : null;
  const newVideos: VideoItem[] = [];
  let pageToken: string | undefined;
  let scanned = 0;

  do {
    const pageParam = pageToken ? `&pageToken=${pageToken}` : "";
    const listData = (await ytFetch(
      `/playlistItems?part=contentDetails,snippet&playlistId=${channel.uploads_playlist_id}&maxResults=50${pageParam}`
    )) as {
      items?: Array<{
        contentDetails: { videoId: string };
        snippet: { title: string; publishedAt: string };
      }>;
      nextPageToken?: string;
    };

    let hitCheckpoint = false;
    for (const item of listData.items || []) {
      const videoId = item.contentDetails?.videoId;
      const title = item.snippet?.title;
      const publishedAt = item.snippet?.publishedAt;
      if (!videoId || !title || !publishedAt) continue;

      scanned++;

      if (checkpoint) {
        if (new Date(publishedAt) <= checkpoint) {
          hitCheckpoint = true;
          break;
        }
      } else if (scanned > NO_CHECKPOINT_FALLBACK_COUNT) {
        // 체크포인트가 없는 채널(백필 누락 등) 안전장치: 최근 N개만
        hitCheckpoint = true;
        break;
      }

      newVideos.push({ videoId, title, publishedAt });
    }

    if (hitCheckpoint) break;
    pageToken = listData.nextPageToken;
  } while (pageToken);

  return newVideos;
}

export async function syncChannel(channel: TrackedChannel): Promise<SyncSummary> {
  const summary: SyncSummary = {
    channelId: channel.channel_id,
    channelName: channel.channel_name,
    newVideos: 0,
    savedChunks: 0,
    skipped: 0,
    errors: 0,
  };

  if (!supabase) {
    summary.error = "Supabase가 설정되지 않았어.";
    return summary;
  }
  if (!channel.uploads_playlist_id) {
    summary.error = "uploads_playlist_id 없음 (백필 필요)";
    return summary;
  }

  try {
    let candidates = await fetchNewVideos(channel);

    // video_id 기준 dedup
    const seen = new Set<string>();
    candidates = candidates.filter((v) => {
      if (seen.has(v.videoId)) return false;
      seen.add(v.videoId);
      return true;
    });

    // DB에 이미 존재하는 영상 한 번 더 제외 (경계값 중복 방지)
    if (candidates.length > 0) {
      const { data: existing } = await supabase
        .from("youtube_videos")
        .select("video_id")
        .in("video_id", candidates.map((v) => v.videoId));
      const existingIds = new Set((existing || []).map((v) => v.video_id));
      candidates = candidates.filter((v) => !existingIds.has(v.videoId));
    }

    summary.newVideos = candidates.length;

    let maxPublishedAt = channel.last_synced_video_at;

    for (const video of candidates) {
      try {
        const result = await ingestVideo(channel.channel_id, channel.channel_name, video);
        if (result.status === "saved") {
          summary.savedChunks += result.chunkCount;
          if (!maxPublishedAt || new Date(video.publishedAt) > new Date(maxPublishedAt)) {
            maxPublishedAt = video.publishedAt;
          }
        } else {
          summary.skipped++;
        }
      } catch (err) {
        summary.errors++;
        console.error(`[youtube-sync] ${channel.channel_name} / ${video.title} 처리 실패:`, err);
      }
    }

    await supabase
      .from("youtube_channels")
      .update({
        last_synced_at: new Date().toISOString(),
        last_synced_video_at: maxPublishedAt || null,
      })
      .eq("channel_id", channel.channel_id);
  } catch (err) {
    summary.error = err instanceof Error ? err.message : "동기화 중 알 수 없는 오류";
    console.error(`[youtube-sync] ${channel.channel_name} 동기화 실패:`, err);
  }

  return summary;
}

export async function syncAllActiveChannels(onlyChannelId?: string): Promise<SyncSummary[]> {
  if (!supabase) return [{ channelId: "-", channelName: "-", newVideos: 0, savedChunks: 0, skipped: 0, errors: 0, error: "Supabase가 설정되지 않았어." }];

  let query = supabase
    .from("youtube_channels")
    .select("channel_id, channel_name, uploads_playlist_id, last_synced_video_at")
    .eq("is_active", true);

  if (onlyChannelId) query = query.eq("channel_id", onlyChannelId);

  const { data: channels, error } = await query;
  if (error || !channels) {
    return [{ channelId: onlyChannelId || "-", channelName: "-", newVideos: 0, savedChunks: 0, skipped: 0, errors: 0, error: error?.message || "채널 목록을 가져올 수 없어." }];
  }

  const summaries: SyncSummary[] = [];
  for (const channel of channels as TrackedChannel[]) {
    const summary = await syncChannel(channel);
    summaries.push(summary);

    if (summary.error?.toLowerCase().includes("quota")) {
      console.error("[youtube-sync] YouTube API 쿼터 초과로 동기화 중단:", summary.error);
      break;
    }

    await new Promise((r) => setTimeout(r, 300));
  }

  return summaries;
}
