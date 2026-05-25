import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { supabase } from "@/lib/supabase";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const QUERIES = {
  macro: "interest rate inflation Federal Reserve GDP recession central bank trade war currency",
  us: "US stock market S&P 500 Nasdaq earnings Wall Street economy forecast",
  korea: "KOSPI Korea stock market Samsung Hyundai economy exports",
  china: "China stock market Shanghai CSI economy exports manufacturing",
};

async function fetchNews(query: string, pageSize = 5) {
  const apiKey = process.env.NEWS_API_KEY;
  if (!apiKey) return [];

  const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&language=en&sortBy=publishedAt&pageSize=${pageSize}&apiKey=${apiKey}`;
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) return [];

  const data = await res.json();
  return (data.articles || [])
    .filter((a: { title?: string; description?: string }) => a.title && a.description)
    .map((a: { title: string; description: string }) => ({
      title: a.title,
      description: a.description,
    }));
}

function formatArticles(articles: { title: string; description: string }[]) {
  return articles.map((a) => `- ${a.title}\n  ${a.description}`).join("\n");
}

async function generateDigest(
  macro: { title: string; description: string }[],
  us: { title: string; description: string }[],
  korea: { title: string; description: string }[],
  china: { title: string; description: string }[]
): Promise<string> {
  const prompt = `다음 뉴스들을 투자 관점에서 분석해서 아래 형식으로 한국어 요약을 만들어줘.

경제/주식 시장에 실질적으로 영향을 줄 수 있는 뉴스만 선별해서 포함해.
각 뉴스에서 핵심 키워드를 추출하고 1~2줄로 간결하게 요약해.
투자자 입장에서 의미있는 내용 위주로 써줘.

출력 형식 (정확히 이 형식으로):
[거시경제]
1. (핵심키워드) 요약 1~2줄
(최대 5개, 없으면 생략)

[미국 시장]
1. (핵심키워드) 요약 1~2줄
2. (핵심키워드) 요약 1~2줄
3. (핵심키워드) 요약 1~2줄

[한국 시장]
1. (핵심키워드) 요약 1~2줄
2. (핵심키워드) 요약 1~2줄
3. (핵심키워드) 요약 1~2줄

[중국 시장]
1. (핵심키워드) 요약 1~2줄
2. (핵심키워드) 요약 1~2줄
3. (핵심키워드) 요약 1~2줄

---

수집된 뉴스:

[거시경제 뉴스]
${formatArticles(macro)}

[미국 시장 뉴스]
${formatArticles(us)}

[한국 시장 뉴스]
${formatArticles(korea)}

[중국 시장 뉴스]
${formatArticles(china)}`;

  const response = await client.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: "투자 전문 애널리스트로서 뉴스를 분석하고 투자자에게 유용한 형식으로 요약합니다.",
      },
      { role: "user", content: prompt },
    ],
  });

  return response.choices[0].message.content || "";
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!supabase) {
    return NextResponse.json({ error: "Supabase가 설정되지 않았습니다." }, { status: 500 });
  }

  try {
    // 뉴스 수집
    const [macro, us, korea, china] = await Promise.all([
      fetchNews(QUERIES.macro, 8),
      fetchNews(QUERIES.us, 6),
      fetchNews(QUERIES.korea, 6),
      fetchNews(QUERIES.china, 6),
    ]);

    // GPT 다이제스트 생성
    const digest = await generateDigest(macro, us, korea, china);

    if (!digest) {
      return NextResponse.json({ error: "다이제스트 생성 실패" }, { status: 500 });
    }

    // Supabase 저장
    const today = new Date().toLocaleDateString("ko-KR", {
      year: "numeric", month: "2-digit", day: "2-digit",
    });

    const { error } = await supabase.from("news").insert({
      title: `일간 시장 요약 — ${today}`,
      summary: digest,
      industry: "digest",
      importance: "높음",
      url: "-",
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      message: "뉴스 수집 및 다이제스트 생성 완료",
      collected: macro.length + us.length + korea.length + china.length,
      digest_preview: digest.substring(0, 200) + "...",
    });
  } catch (err) {
    console.error("뉴스 수집 오류:", err);
    return NextResponse.json({ error: "수집 중 오류 발생" }, { status: 500 });
  }
}
