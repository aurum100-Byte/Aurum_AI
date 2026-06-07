import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { supabase } from "@/lib/supabase";

export const maxDuration = 60;

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function extractPdfText(buffer: Buffer): Promise<string> {
  // pdf-parse v1 — lib/pdf-parse.js 직접 import로 테스트 파일 로딩 우회
  // index.js가 초기화 시 ./test/data/05-versions-space.pdf를 읽으려다 실패하는 문제 해결
  // @ts-expect-error — pdf-parse v1 내부 경로, 타입 선언 없음
  const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default as (
    data: Buffer
  ) => Promise<{ text: string }>;
  const result = await pdfParse(buffer);
  return result.text || "";
}

async function analyzeDocument(text: string, fileName: string, attempt = 1): Promise<Record<string, unknown>> {
  // 토큰 절약: 최대 20,000자로 축소
  const truncated =
    text.length > 20000 ? text.substring(0, 20000) + "\n\n[이후 내용 생략]" : text;

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

  try {
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
      // JSON 파싱 실패 시 빈 분석 결과로 저장 (데이터 유실 방지)
      return { objective_data: raw, subjective_opinion: "", ai_opinion: "", summary: "JSON 파싱 실패 — 원문 저장됨", tags: [] };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // 429 Rate Limit → 최대 3회 재시도 (점진적 대기)
    if (msg.includes("429") && attempt <= 3) {
      const waitMs = attempt * 3000; // 3s → 6s → 9s
      await new Promise((r) => setTimeout(r, waitMs));
      return analyzeDocument(text, fileName, attempt + 1);
    }
    throw err;
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
    let pdfError = "";
    try {
      extractedText = await extractPdfText(buffer);
    } catch (err) {
      pdfError = err instanceof Error ? err.message : String(err);
      console.error("pdf-parse 오류:", pdfError);
    }

    if (!extractedText.trim()) {
      return NextResponse.json(
        {
          error: pdfError
            ? `텍스트 추출 실패: ${pdfError}`
            : "PDF 텍스트 추출 불가 (이미지 PDF는 지원하지 않음)",
        },
        { status: 400 }
      );
    }

    // AI 분석
    const analysis = await analyzeDocument(extractedText, file.name);

    // Supabase 저장
    const { error } = await supabase.from("documents").insert({
      file_name: file.name,
      content: extractedText.substring(0, 100000),
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
