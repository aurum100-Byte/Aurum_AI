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

export type ConversationEntry = {
  id: string;
  created_at: string;
  title: string;
  summary: string;
};

export type MessageEntry = {
  id: string;
  conversation_id: string;
  created_at: string;
  role: "user" | "assistant";
  content: string;
};

export type DocumentEntry = {
  id: string;
  created_at: string;
  file_name: string;
  content: string;
  objective_data: string;
  subjective_opinion: string;
  ai_opinion: string;
  summary: string;
  tags: string[];
};

export type YoutubeChannel = {
  id: string;
  channel_id: string;
  channel_name: string;
  channel_url: string;
  video_count: number;
  created_at: string;
  uploads_playlist_id: string | null;
  is_active: boolean;
  last_synced_at: string | null;
  last_synced_video_at: string | null;
};

function createSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export const supabase = createSupabaseClient();
