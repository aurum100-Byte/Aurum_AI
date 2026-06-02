import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!supabase)
    return NextResponse.json({ error: "Supabase 미설정" }, { status: 500 });

  const { id } = await params;
  const { role, content } = await req.json();

  const { error } = await supabase
    .from("messages")
    .insert({ conversation_id: id, role, content });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true }, { status: 201 });
}
