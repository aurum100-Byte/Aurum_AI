import { NextRequest, NextResponse } from "next/server";
import { syncAllActiveChannels } from "@/lib/youtubeSync";

export const maxDuration = 60;

function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;
  const authHeader = req.headers.get("authorization");
  return authHeader === `Bearer ${cronSecret}`;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let channelId: string | undefined;
  try {
    const body = await req.json();
    channelId = body?.channelId;
  } catch {
    // 바디 없이 호출하는 경우(Vercel Cron)도 허용
  }
  channelId = channelId || req.nextUrl.searchParams.get("channelId") || undefined;

  try {
    const summaries = await syncAllActiveChannels(channelId);
    return NextResponse.json({ summaries });
  } catch (err) {
    console.error("[youtube-sync] 동기화 오류:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "동기화 중 오류 발생" },
      { status: 500 }
    );
  }
}

// Vercel Cron은 GET으로 호출하므로 동일 로직을 GET에도 연결
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const channelId = req.nextUrl.searchParams.get("channelId") || undefined;

  try {
    const summaries = await syncAllActiveChannels(channelId);
    return NextResponse.json({ summaries });
  } catch (err) {
    console.error("[youtube-sync] 동기화 오류:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "동기화 중 오류 발생" },
      { status: 500 }
    );
  }
}
