import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { supabase } from "@/lib/supabase";

export const maxDuration = 60;

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function sanitizeText(text: string): string {
  return text
    .replace(/\0/g, "")
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/�/g, "")
    .replace(/\r\n/g, "\n")
    .trim();
}

async function analyzeDocument(
  text: string,
  fileName: string,
  attempt = 1
): Promise<Record<string, unknown>> {
  const clean = sanitizeText(text);
  const truncated =
    clean.length > 20000 ? clean.substring(0, 20000) + "\n\n[이후 내용 생략]" : clean;

  const prompt = `아래 PDF 문서를 투자 관점에서 분석해서 정확히 이 JSON 형식으로만 응답해줘. 다른 말 붙이지 말고 JSON만. 모든 값은 일반 한국어 문자열로만:

{
  "objective_data": "문서에 나온 수치/실적/통계 등 확인 가능한 팩트만. 주관적 해석 없이.",
  "subjective_opinion": "작성자의 전망/예측/추천/목표주가 등 주관적 판단이 담긴 내용만.",
  "ai_opinion": "작성자 주관적 의견에 대한 AI 동의/반박/보완. 반드시 이유 포함. 동의하는 부분과 반박하는 부분 구분.",
  "summary": "문서 전체 요약 3~5줄.",
  "tags": ["관련산업1", "기업명2", "테마3"]
}

파일명: ${fileName}

문서 내용:
${truncated}`;

  try {
    const response = await client.chat.completions.create({
      model: "gpt-4.1",
      messages: [
        {
          role: "system",
          content: "투자 리서치 문서를 분석하는 전문 애널리스트. 반드시 유효한 JSON으로만 응답.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    });

    const raw = response.choices[0].message.content || "{}";
    try {
      return JSON.parse(raw);
    } catch {
      return { objective_data: raw, subjective_opinion: "", ai_opinion: "", summary: "JSON 파싱 실패", tags: [] };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("429") && attempt <= 3) {
      const waitMs = attempt * 3000;
      await new Promise((r) => setTimeout(r, waitMs));
      return analyzeDocument(text, fileName, attempt + 1);
    }
    console.error("analyzeDocument 오류:", msg);
    return { objective_data: "", subjective_opinion: "", ai_opinion: "", summary: `분석 오류: ${msg}`, tags: [] };
  }
}

export async function POST(req: NextRequest) {
  if (!supabase) {
    return NextResponse.json({ error: "Supabase 미설정" }, { status: 500 });
  }

  try {
    // 클라이언트에서 텍스트 추출 후 JSON으로 전송
    const { fileName, text } = await req.json();

    if (!fileName || !text?.trim()) {
      return NextResponse.json({ error: "파일명 또는 텍스트가 없습니다." }, { status: 400 });
    }

    const analysis = await analyzeDocument(text, fileName);

    const { error } = await supabase.from("documents").insert({
      file_name: fileName,
      content: text.substring(0, 100000),
      objective_data: analysis.objective_data || "",
      subjective_opinion: analysis.subjective_opinion || "",
      ai_opinion: analysis.ai_opinion || "",
      summary: analysis.summary || "",
      tags: Array.isArray(analysis.tags) ? analysis.tags : [],
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, file_name: fileName });
  } catch (err) {
    console.error("PDF 업로드 오류:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "업로드 중 오류 발생" },
      { status: 500 }
    );
  }
}
