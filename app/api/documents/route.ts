import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  if (!supabase) return NextResponse.json({ documents: [] });

  const { data, error } = await supabase
    .from("documents")
    .select("id, created_at, file_name, summary, tags, objective_data, subjective_opinion, ai_opinion")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ documents: data || [] });
}
