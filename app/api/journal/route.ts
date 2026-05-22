import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  if (!supabase) {
    return NextResponse.json({ entries: [] });
  }

  const { searchParams } = req.nextUrl;
  const tag = searchParams.get("tag");

  let query = supabase
    .from("journal")
    .select("*")
    .order("created_at", { ascending: false });

  if (tag && tag !== "전체") {
    query = query.contains("tags", [tag]);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ entries: data || [] });
}

export async function POST(req: NextRequest) {
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase가 설정되지 않았습니다." },
      { status: 500 }
    );
  }

  const { title, content, tags, mood } = await req.json();

  if (!title?.trim() || !content?.trim() || !mood) {
    return NextResponse.json(
      { error: "제목, 내용, 확신도는 필수입니다." },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("journal")
    .insert({ title: title.trim(), content: content.trim(), tags: tags || [], mood })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ entry: data }, { status: 201 });
}
