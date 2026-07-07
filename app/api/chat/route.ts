import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { INVESTMENT_SYSTEM_PROMPT } from "@/lib/systemPrompt";
import { supabase, type JournalEntry } from "@/lib/supabase";
import { searchYoutubeContext } from "@/lib/youtube-rag";
import { searchDocumentContext } from "@/lib/document-rag";

export const maxDuration = 60;

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// web_search_preview 툴을 쓰면 모델이 프롬프트 지시를 무시하고 마크다운 링크/출처를
// 본문에 박아넣는 경우가 많아서, 응답 텍스트에서 링크를 강제로 제거한다.
function stripCitations(text: string): string {
  return text
    // [도메인](https://...) 형태의 마크다운 링크 → 통째로 제거
    .replace(/\[[^\]]*\]\(https?:\/\/[^\s)]+\)/g, "")
    // 링크 제거 후 남는 빈 괄호/쉼표 묶음 제거: (), (, ), (, , )
    .replace(/\(\s*(?:,\s*)*\)/g, "")
    // 혹시 남는 raw URL 제거
    .replace(/https?:\/\/[^\s)]+/g, "")
    // 정리: 중복 공백, 문장부호 앞 공백
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([.,!?])/g, "$1")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

async function getLatestDigest(): Promise<string> {
  if (!supabase) return "";

  const { data } = await supabase
    .from("news")
    .select("summary, created_at")
    .eq("industry", "digest")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return "";

  const date = new Date(data.created_at).toLocaleDateString("ko-KR");
  return `📰 ${date} 기준 시장 동향\n\n${data.summary}`;
}

async function getJournalContext(): Promise<string> {
  if (!supabase) return "";

  const { data } = await supabase
    .from("journal")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(5);

  if (!data || data.length === 0) return "";

  const entries = data as JournalEntry[];
  return (
    "\n\n### 사용자 투자 일지 (최근 5개)\n" +
    entries
      .map(
        (j) =>
          `- [${new Date(j.created_at).toLocaleDateString("ko-KR")}] ${j.title}\n  확신도: ${j.mood} | 태그: ${j.tags?.join(", ") || "-"}\n  ${j.content.substring(0, 200)}`
      )
      .join("\n")
  );
}

async function getRegisteredChannels(): Promise<string> {
  if (!supabase) return "";

  const { data } = await supabase
    .from("youtube_channels")
    .select("channel_name, channel_url")
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (!data || data.length === 0) return "";

  return (
    "\n\n### 등록된 유튜브 채널 목록\n" +
    data.map((c) => `- ${c.channel_name}`).join("\n")
  );
}

async function getPreviousSummaries(currentConvId?: string): Promise<string> {
  if (!supabase) return "";

  let query = supabase
    .from("conversations")
    .select("title, summary, created_at")
    .not("summary", "is", null)
    .neq("summary", "")
    .order("created_at", { ascending: false })
    .limit(5);

  if (currentConvId) {
    query = query.neq("id", currentConvId);
  }

  const { data } = await query;
  if (!data || data.length === 0) return "";

  return (
    "\n\n### 이전 대화 기억 (참고용)\n" +
    data
      .map((c, i) => `[대화 ${i + 1}: ${c.title}]\n${c.summary}`)
      .join("\n\n")
  );
}

export async function POST(req: NextRequest) {
  try {
    const { messages, includeJournal, conversationId } = await req.json();

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "메시지가 없습니다." }, { status: 400 });
    }

    const lastUserMessage = messages[messages.length - 1]?.content || "";
    const [digest, journalContext, prevSummaries, registeredChannels, docContext, youtubeContext] = await Promise.all([
      getLatestDigest(),
      includeJournal ? getJournalContext() : Promise.resolve(""),
      getPreviousSummaries(conversationId),
      getRegisteredChannels(),
      searchDocumentContext(lastUserMessage),
      searchYoutubeContext(lastUserMessage),
    ]);

    const today = new Date().toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "long",
    });
    let systemPrompt = `오늘 날짜: ${today}\n이 날짜를 기준으로 '최근', '현재', '올해' 같은 시간 표현을 판단해줘. 훈련 데이터 이후의 정보는 모를 수 있지만, 오늘이 언제인지는 항상 알고 있어야 해.\n\n` + INVESTMENT_SYSTEM_PROMPT;

    if (digest) {
      systemPrompt += `\n\n---\n### 오늘의 시장 동향 (참고용)\n${digest}`;
    }

    if (journalContext) {
      systemPrompt += journalContext;
    }

    if (prevSummaries) {
      systemPrompt += prevSummaries;
    }

    if (registeredChannels) {
      systemPrompt += registeredChannels;
    }

    if (docContext) {
      systemPrompt += docContext;
    }

    if (youtubeContext) {
      systemPrompt += youtubeContext;
    }

    const response = await client.responses.create({
      model: "o4-mini",
      tools: [{ type: "web_search_preview" }],
      tool_choice: "auto",
      reasoning: { effort: "low" },
      instructions: systemPrompt,
      input: messages.map((m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    });

    const reply = stripCitations(response.output_text ?? "");
    return NextResponse.json({ reply });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("Chat API 오류:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
