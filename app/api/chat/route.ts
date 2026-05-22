import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { INVESTMENT_SYSTEM_PROMPT } from "@/lib/systemPrompt";
import { supabase, type NewsItem, type JournalEntry } from "@/lib/supabase";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const INDUSTRY_KEYWORDS = [
  "AI",
  "반도체",
  "전력",
  "우주",
  "로봇",
  "자율주행",
  "국방",
  "에너지",
  "원전",
];

async function getRelevantNews(userMessage: string): Promise<NewsItem[]> {
  if (!supabase) return [];

  const matched = INDUSTRY_KEYWORDS.filter((k) =>
    userMessage.toLowerCase().includes(k.toLowerCase())
  );

  const query = supabase
    .from("news")
    .select("*")
    .order("created_at", { ascending: false });

  if (matched.length > 0) {
    query.in("industry", matched);
  }

  const { data } = await query.limit(5);
  return (data as NewsItem[]) || [];
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

export async function POST(req: NextRequest) {
  try {
    const { messages, includeJournal } = await req.json();

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "메시지가 없습니다." },
        { status: 400 }
      );
    }

    const lastUserMsg =
      [...messages].reverse().find((m) => m.role === "user")?.content || "";

    const [relevantNews, journalContext] = await Promise.all([
      getRelevantNews(lastUserMsg),
      includeJournal ? getJournalContext() : Promise.resolve(""),
    ]);

    let systemPrompt = INVESTMENT_SYSTEM_PROMPT;

    if (relevantNews.length > 0) {
      systemPrompt +=
        "\n\n### 최신 관련 뉴스 (컨텍스트로 참고)\n" +
        relevantNews
          .map(
            (n) =>
              `- [${n.industry} | 중요도: ${n.importance}] ${n.title}\n  ${n.summary}`
          )
          .join("\n");
    }

    if (journalContext) {
      systemPrompt += journalContext;
    }

    const response = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        ...messages.map(
          (m: { role: string; content: string }) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })
        ),
      ],
    });

    const reply = response.choices[0].message.content;
    return NextResponse.json({ reply });
  } catch (error) {
    console.error("OpenAI API 오류:", error);
    return NextResponse.json(
      { error: "AI 응답 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
