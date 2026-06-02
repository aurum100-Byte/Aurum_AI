import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// 대화의 메시지 목록 조회
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!supabase) return NextResponse.json({ messages: [] });

  const { id } = await params;

  const { data, error } = await supabase
    .from("messages")
    .select("id, role, content, created_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ messages: data || [] });
}

// 제목 또는 요약 업데이트
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!supabase)
    return NextResponse.json({ error: "Supabase 미설정" }, { status: 500 });

  const { id } = await params;
  const body = await req.json();

  const updates: { title?: string; summary?: string } = {};
  if (body.title !== undefined) updates.title = body.title;
  if (body.summary !== undefined) updates.summary = body.summary;

  const { error } = await supabase
    .from("conversations")
    .update(updates)
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

// 대화 삭제 (메시지도 cascade 삭제)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!supabase)
    return NextResponse.json({ error: "Supabase 미설정" }, { status: 500 });

  const { id } = await params;

  const { error } = await supabase
    .from("conversations")
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
