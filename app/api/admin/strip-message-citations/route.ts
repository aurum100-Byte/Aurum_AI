import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { stripCitations } from "@/lib/stripCitations";

export const maxDuration = 60;

/**
 * 일회성 정리: 링크 제거 로직이 배포되기 전에 저장된 과거 assistant 메시지들의
 * 본문에서 출처 링크/URL을 일괄 제거한다.
 * 기본은 dry-run (변경될 메시지 개수와 미리보기만 반환). ?apply=1 일 때만 실제 수정.
 * 실행:
 *   미리보기: curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/admin/strip-message-citations
 *   실제 적용: curl -X POST -H "Authorization: Bearer $CRON_SECRET" "https://<host>/api/admin/strip-message-citations?apply=1"
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

  const apply = req.nextUrl.searchParams.get("apply") === "1";

  const changed: Array<{ id: string; before: string; after: string }> = [];
  let scanned = 0;

  const PAGE = 500;
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("messages")
      .select("id, content")
      .eq("role", "assistant")
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data || data.length === 0) break;

    for (const row of data) {
      scanned++;
      const stripped = stripCitations(row.content ?? "");
      if (stripped !== row.content) {
        changed.push({ id: row.id, before: row.content, after: stripped });
      }
    }

    if (data.length < PAGE) break;
    from += PAGE;
  }

  let updated = 0;
  const updateErrors: Array<{ id: string; error: string }> = [];

  if (apply) {
    for (const { id, after } of changed) {
      const { error } = await supabase
        .from("messages")
        .update({ content: after })
        .eq("id", id);
      if (error) updateErrors.push({ id, error: error.message });
      else updated++;
    }
  }

  return NextResponse.json({
    mode: apply ? "apply" : "dry-run",
    scanned,
    needsChange: changed.length,
    updated,
    updateErrors,
    // dry-run 확인용 미리보기 (앞 5개, 앞부분 200자만)
    preview: changed.slice(0, 5).map((c) => ({
      id: c.id,
      before: c.before.slice(0, 200),
      after: c.after.slice(0, 200),
    })),
  });
}
