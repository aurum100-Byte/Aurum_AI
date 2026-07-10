import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { INVESTMENT_SYSTEM_PROMPT } from "@/lib/systemPrompt";
import { supabase, type JournalEntry } from "@/lib/supabase";
import { searchYoutubeContext } from "@/lib/youtube-rag";
import { searchDocumentContext } from "@/lib/document-rag";
import { stripCitations } from "@/lib/stripCitations";

export const maxDuration = 60;

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

// 등록 채널 + 채널별 학습된 최신 영상 목록(제목·업로드일)을 시스템 프롬프트에 주입한다.
// "최근 영상" 질문을 웹 검색(엉뚱한 채널·캐시된 페이지를 집어옴)이 아니라
// YouTube Data API로 동기화된 실제 DB 데이터 기준으로 답하게 하기 위함.
async function getYoutubeCatalog(): Promise<string> {
  if (!supabase) return "";

  const { data: channels } = await supabase
    .from("youtube_channels")
    .select("channel_id, channel_name")
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (!channels || channels.length === 0) return "";

  const { data: videos } = await supabase
    .from("youtube_videos")
    .select("channel_id, title, published_at")
    .in("channel_id", channels.map((c) => c.channel_id))
    .order("published_at", { ascending: false })
    .limit(200);

  const byChannel = new Map<string, { title: string; published_at: string | null }[]>();
  for (const v of videos || []) {
    const list = byChannel.get(v.channel_id) || [];
    if (list.length < 5) {
      list.push(v);
      byChannel.set(v.channel_id, list);
    }
  }

  const lines = channels.map((c) => {
    const vids = byChannel.get(c.channel_id) || [];
    if (vids.length === 0) return `- ${c.channel_name}: (아직 학습된 영상 없음)`;
    return (
      `- ${c.channel_name}:\n` +
      vids
        .map((v) => `    · ${v.published_at?.slice(0, 10) || "날짜 미상"} | ${v.title}`)
        .join("\n")
    );
  });

  return (
    "\n\n### 등록된 유튜브 채널과 학습된 최신 영상 (채널당 최근 5개, 실제 DB 데이터)\n" +
    lines.join("\n") +
    "\n\n[유튜브 답변 규칙]\n" +
    "- 등록된 채널의 '최근 영상'류 질문은 반드시 위 목록만 근거로 답해. 웹 검색으로 채널이나 영상을 찾거나 추측하지 마.\n" +
    "- 위 목록에 없는 영상의 제목·날짜·내용을 절대 만들어내지 마. 목록에 없으면 '아직 학습 안 된 영상'이라고 말해.\n" +
    "- 영상 내용의 상세는 '참고 자료'의 자막 발췌에 있는 만큼만 말해. 발췌가 없으면 제목만 알고 내용은 모른다고 솔직하게 말해."
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
    const [digest, journalContext, prevSummaries, youtubeCatalog, docContext, youtubeContext] = await Promise.all([
      getLatestDigest(),
      includeJournal ? getJournalContext() : Promise.resolve(""),
      getPreviousSummaries(conversationId),
      getYoutubeCatalog(),
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

    if (youtubeCatalog) {
      systemPrompt += youtubeCatalog;
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
