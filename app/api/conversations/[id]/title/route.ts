import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { supabase } from "@/lib/supabase";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!supabase)
    return NextResponse.json({ error: "Supabase 미설정" }, { status: 500 });

  const { id } = await params;
  const { firstMessage } = await req.json();

  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "투자/주식 대화의 첫 메시지를 보고 한국어로 15자 이내의 간결한 대화 제목을 만들어줘. 제목만 출력하고 따옴표나 부가 설명 없이.",
        },
        { role: "user", content: firstMessage },
      ],
      max_tokens: 30,
    });

    const title = response.choices[0].message.content?.trim() || "새 대화";

    await supabase.from("conversations").update({ title }).eq("id", id);

    return NextResponse.json({ title });
  } catch (err) {
    console.error("제목 생성 실패:", err);
    return NextResponse.json({ error: "제목 생성 실패" }, { status: 500 });
  }
}
