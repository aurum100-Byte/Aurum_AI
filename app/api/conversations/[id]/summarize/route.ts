import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { supabase } from "@/lib/supabase";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!supabase)
    return NextResponse.json({ error: "Supabase 미설정" }, { status: 500 });

  const { id } = await params;

  const { data: msgs, error } = await supabase
    .from("messages")
    .select("role, content")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!msgs || msgs.length < 4) {
    return NextResponse.json({ error: "요약할 내용이 부족합니다." }, { status: 400 });
  }

  const conversation = msgs
    .map((m) => `${m.role === "user" ? "사용자" : "AI"}: ${m.content}`)
    .join("\n\n");

  try {
    const response = await client.chat.completions.create({
      model: "gpt-4.1",
      messages: [
        {
          role: "system",
          content: "투자 대화 내용을 분석해서 핵심만 간결하게 요약해줘.",
        },
        {
          role: "user",
          content: `다음 대화를 아래 형식으로 요약해줘:

${conversation}

---
형식:
## 주요 논의 종목/산업
(논의된 종목이나 산업 목록, 없으면 "없음")

## 핵심 결론
(대화에서 도달한 주요 결론들)

## 사용자 투자 관심사
(사용자가 보인 투자 성향과 관심 분야)

## 미결 질문
(다음 대화에서 이어서 다룰 만한 주제나 질문들)`,
        },
      ],
    });

    const summary = response.choices[0].message.content || "";
    await supabase.from("conversations").update({ summary }).eq("id", id);

    return NextResponse.json({ summary });
  } catch (err) {
    console.error("요약 생성 실패:", err);
    return NextResponse.json({ error: "요약 생성 실패" }, { status: 500 });
  }
}
