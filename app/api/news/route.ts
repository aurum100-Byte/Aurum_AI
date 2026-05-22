import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  if (!supabase) {
    return NextResponse.json({ news: [] });
  }

  const { searchParams } = req.nextUrl;
  const industry = searchParams.get("industry");
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);

  let query = supabase
    .from("news")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (industry && industry !== "전체") {
    query = query.eq("industry", industry);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ news: data || [] });
}
