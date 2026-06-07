import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { supabase } from "@/lib/supabase";

// pdf-parse는 CJS 전용이므로 require 사용
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse") as (
  data: Buffer
) => Promise<{ text: string; numpages: number }>;

export const maxDuration = 60;

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function analyzeDocument(text: string, fileName: string) {
  // 토큰 제한 대비 최대 60,000자로 자름
  const truncated = text.length > 60000 ? text.substring(0, 60000) + "\n\n[이후 내용 생략]" : text;

  const prompt = `아래 PDF 문서를 투자 관점에서 분석해서 정확히 이 JSON 형식으로만 응답해줘. 다른 말 붙이지 말고 JSON만:

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

  const response = await client.chat.completions.create({
    model: "gpt-4o",
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
    return {
      objective_data: "",
      subjective_opinion: "",
      ai_opinion: "",
      summary: "",
      tags: [],
    };
  }
}

export async function POST(req: NextRequest) {
  if (!supabase) {
    return NextResponse.json({ error: "Supabase 미설정" }, { status: 500 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "파일이 없습니다." }, { status: 400 });
    }
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ error: "PDF 파일만 업로드 가능합니다." }, { status: 400 });
    }

    // PDF 텍스트 추출
    const buffer = Buffer.from(await file.arrayBuffer());
    let extractedText = "";
    try {
      const parsed = await pdfParse(buffer);
      extractedText = parsed.text || "";
    } catch {
      extractedText = "";
    }

    if (!extractedText.trim()) {
      return NextResponse.json(
        { error: "PDF에서 텍스트를 추출할 수 없습니다. (스캔 이미지 PDF는 지원하지 않음)" },
        { status: 400 }
      );
    }

    // AI 분석
    const analysis = await analyzeDocument(extractedText, file.name);

    // Supabase 저장
    const { error } = await supabase.from("documents").insert({
      file_name: file.name,
      content: extractedText.substring(0, 100000), // 최대 100k자
      objective_data: analysis.objective_data || "",
      subjective_opinion: analysis.subjective_opinion || "",
      ai_opinion: analysis.ai_opinion || "",
      summary: analysis.summary || "",
      tags: Array.isArray(analysis.tags) ? analysis.tags : [],
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, file_name: file.name });
  } catch (err) {
    console.error("PDF 업로드 오류:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "업로드 중 오류 발생" },
      { status: 500 }
    );
  }
}
