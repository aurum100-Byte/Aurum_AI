import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  if (!supabase) return NextResponse.json({ error: "Supabase 미설정" }, { status: 500 });

  const { data, error } = await supabase
    .from("youtube_channels")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ channels: data });
}

export async function DELETE(req: NextRequest) {
  if (!supabase) return NextResponse.json({ error: "Supabase 미설정" }, { status: 500 });

  const { searchParams } = new URL(req.url);
  const channelId = searchParams.get("channelId");
  if (!channelId) return NextResponse.json({ error: "channelId 없음" }, { status: 400 });

  // video_id 목록 먼저 가져오기 (FK cascade이지만 명시적으로 삭제)
  const { data: videos } = await supabase
    .from("youtube_videos")
    .select("video_id")
    .eq("channel_id", channelId);

  if (videos && videos.length > 0) {
    const videoIds = videos.map((v) => v.video_id);
    await supabase.from("youtube_transcripts").delete().in("video_id", videoIds);
    await supabase.from("youtube_videos").delete().in("video_id", videoIds);
  }

  await supabase.from("youtube_channels").delete().eq("channel_id", channelId);

  return NextResponse.json({ success: true });
}
