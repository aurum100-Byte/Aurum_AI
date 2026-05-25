import { NextResponse } from "next/server";
import { runNewsCollection } from "@/lib/collectNews";

// 프론트엔드에서 호출하는 뉴스 수집 트리거
// HTTP 내부 호출 없이 로직을 직접 실행 (Vercel URL 이슈 방지)
export const maxDuration = 60;

export async function POST() {
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
