import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { INVESTMENT_SYSTEM_PROMPT } from "@/lib/systemPrompt";
import { supabase, type JournalEntry } from "@/lib/supabase";

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

async function getDocumentContext(): Promise<string> {
  if (!supabase) return "";

  const { data } = await supabase
    .from("documents")
    .select("file_name, summary, tags, objective_data, subjective_opinion, ai_opinion, created_at")
    .order("created_at", { ascending: false })
    .limit(5);

  if (!data || data.length === 0) return "";

  return (
    "\n\n### 저장된 리서치 문서\n" +
    data
      .map((d) => {
        const date = new Date(d.created_at).toLocaleDateString("ko-KR");
        return (
          `[${d.file_name}] (${date})\n` +
          `태그: ${d.tags?.join(", ") || "-"}\n` +
          `요약: ${(d.summary || "-").substring(0, 300)}\n` +
          `팩트: ${(d.objective_data || "-").substring(0, 300)}\n` +
          `작성자 의견: ${(d.subjective_opinion || "-").substring(0, 300)}\n` +
          `AI 의견: ${(d.ai_opinion || "-").substring(0, 400)}`
        );
      })
      .join("\n\n")
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

    const [digest, journalContext, prevSummaries, docContext] = await Promise.all([
      getLatestDigest(),
      includeJournal ? getJournalContext() : Promise.resolve(""),
      getPreviousSummaries(conversationId),
      getDocumentContext(),
    ]);

    let systemPrompt = INVESTMENT_SYSTEM_PROMPT;

    if (digest) {
      systemPrompt += `\n\n---\n### 오늘의 시장 동향 (참고용)\n${digest}`;
    }

    if (journalContext) {
      systemPrompt += journalContext;
    }

    if (prevSummaries) {
      systemPrompt += prevSummaries;
    }

    if (docContext) {
      systemPrompt += docContext;
    }

    const response = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        ...messages.map((m: { role: string; content: string }) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
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
