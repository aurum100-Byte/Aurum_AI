import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import OpenAI from "openai";

export async function GET() {
  const result: Record<string, unknown> = {};

  // 1. 환경변수 존재 여부 확인
  const openaiKey = process.env.OPENAI_API_KEY;
  result.openai_key_set = !!openaiKey;
  result.openai_key_length = openaiKey?.length ?? 0;
  result.openai_key_prefix = openaiKey?.substring(0, 8) ?? "(없음)";

  // 2. Supabase 확인
  if (!supabase) {
    result.supabase = false;
  } else {
    const { error } = await supabase.from("journal").select("count");
    result.supabase = !error;
    if (error) result.supabase_error = error.message;
  }

  // 3. OpenAI API 실제 호출 테스트
  if (openaiKey) {
    try {
      const client = new OpenAI({ apiKey: openaiKey });
      const res = await client.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 5,
      });
      result.openai = true;
      result.openai_model = res.model;
    } catch (err) {
      result.openai = false;
      result.openai_error =
        err instanceof Error ? err.message : String(err);
    }
  } else {
    result.openai = false;
    result.openai_error = "OPENAI_API_KEY 환경변수가 없습니다.";
  }

  return NextResponse.json(result);
}
