import { createClient } from "@supabase/supabase-js";

export type JournalEntry = {
  id: string;
  created_at: string;
  title: string;
  content: string;
  tags: string[];
  mood: "높음" | "중간" | "낮음";
};

export type NewsItem = {
  id: string;
  created_at: string;
  title: string;
  summary: string;
  industry: string;
  importance: "높음" | "중간" | "낮음";
  url: string;
};

function createSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export const supabase = createSupabaseClient();
