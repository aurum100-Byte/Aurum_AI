import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { embedDocument } from "@/lib/documentEmbedding";

export const maxDuration = 60;

/**
 * 일회성 백필: embedding이 비어있는 기존 리서치 문서들에 임베딩을 채운다.
 * 실행: curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/admin/backfill-document-embeddings
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

  const { data: docs, error } = await supabase
    .from("documents")
    .select("id, file_name, summary, objective_data, subjective_opinion, ai_opinion, tags")
    .is("embedding", null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!docs || docs.length === 0) {
    return NextResponse.json({ message: "백필할 문서 없음", updated: 0 });
  }

  let updated = 0;
  const errors: Array<{ id: string; error: string }> = [];

  for (const doc of docs) {
    try {
      const embedding = await embedDocument(doc);
      const { error: updateError } = await supabase
        .from("documents")
        .update({ embedding })
        .eq("id", doc.id);

      if (updateError) {
        errors.push({ id: doc.id, error: updateError.message });
        continue;
      }
      updated++;
    } catch (err) {
      errors.push({ id: doc.id, error: err instanceof Error ? err.message : "알 수 없는 오류" });
    }
  }

  return NextResponse.json({ totalPending: docs.length, updated, errors });
}
