import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  if (!supabase) return NextResponse.json({ conversations: [] });

  const { data, error } = await supabase
    .from("conversations")
    .select("id, created_at, title, summary")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ conversations: data || [] });
}

export async function POST() {
  if (!supabase)
    return NextResponse.json({ error: "Supabase 미설정" }, { status: 500 });

  const { data, error } = await supabase
    .from("conversations")
    .insert({ title: "새 대화" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ conversation: data }, { status: 201 });
}
