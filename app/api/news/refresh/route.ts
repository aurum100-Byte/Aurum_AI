import { NextResponse } from "next/server";

// 프론트엔드에서 호출하는 뉴스 수집 트리거
// CRON_SECRET을 클라이언트에 노출하지 않기 위한 서버 래퍼
export async function POST(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";

  const res = await fetch(`${baseUrl}/api/news/collect`, {
    headers: {
      Authorization: `Bearer ${cronSecret}`,
    },
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
