import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  if (!supabase) {
    return NextResponse.json({
      supabase: false,
      message: "Supabase 환경변수가 설정되지 않았습니다.",
    });
  }

  const { data, error } = await supabase.from("journal").select("count");

  if (error) {
    return NextResponse.json({
      supabase: true,
      connected: false,
      error: error.message,
    });
  }

  return NextResponse.json({
    supabase: true,
    connected: true,
    message: "Supabase 연결 성공 ✓",
  });
}
