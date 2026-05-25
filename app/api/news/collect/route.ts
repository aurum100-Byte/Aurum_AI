import { NextRequest, NextResponse } from "next/server";
import { runNewsCollection } from "@/lib/collectNews";

// Vercel Cron Job 타임아웃 대응
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runNewsCollection();
    return NextResponse.json(result);
  } catch (err) {
    console.error("뉴스 수집 오류:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "수집 중 오류 발생" },
      { status: 500 }
    );
  }
}
