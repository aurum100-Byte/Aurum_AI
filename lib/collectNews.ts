import OpenAI from "openai";
import { supabase } from "./supabase";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const QUERIES = {
  macro: "Federal Reserve interest rate inflation GDP economy recession trade tariff dollar bond yield",
  us: "US stock market S&P 500 Nasdaq earnings Wall Street economy forecast",
  industry: "AI semiconductor electric vehicle renewable energy robotics defense biotech space technology sector",
};

type Article = { title: string; description: string };

async function fetchNews(query: string, pageSize = 5): Promise<Article[]> {
  const apiKey = process.env.NEWS_API_KEY;
  if (!apiKey) return [];

  const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&language=en&sortBy=publishedAt&pageSize=${pageSize}&apiKey=${apiKey}`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      console.error(`NewsAPI 오류: ${res.status} ${res.statusText}`);
      return [];
    }
    const data = await res.json();
    return (data.articles || [])
      .filter((a: Partial<Article>) => a.title && a.description)
      .map((a: Article) => ({ title: a.title, description: a.description }));
  } catch (err) {
    console.error("NewsAPI fetch 실패:", err);
    return [];
  }
}

function formatArticles(articles: Article[]): string {
  if (articles.length === 0) return "(수집된 뉴스 없음)";
  return articles.map((a) => `- ${a.title}\n  ${a.description}`).join("\n");
}

async function generateDigest(
  macro: Article[],
  us: Article[],
  industry: Article[]
): Promise<string> {
  const prompt = `다음 뉴스들을 투자 관점에서 분석해서 아래 형식으로 한국어 요약을 만들어줘.

규칙:
- 각 섹션 반드시 3개씩, 총 9개 작성. 뉴스가 부족하면 수집된 내용을 바탕으로 추론해서라도 3개 채워줘.
- 각 항목은 (핵심키워드)와 1~2줄 요약으로 구성.
- 투자자 관점에서 실질적으로 의미있는 내용 위주로.

출력 형식 (정확히 이 형식으로, 다른 말 없이):
[거시경제]
1. (핵심키워드) 요약 1~2줄
2. (핵심키워드) 요약 1~2줄
3. (핵심키워드) 요약 1~2줄

[미국 시장]
1. (핵심키워드) 요약 1~2줄
2. (핵심키워드) 요약 1~2줄
3. (핵심키워드) 요약 1~2줄

[주목 산업]
1. (산업명) 요약 1~2줄
2. (산업명) 요약 1~2줄
3. (산업명) 요약 1~2줄

---

수집된 뉴스:

[거시경제 뉴스]
${formatArticles(macro)}

[미국 시장 뉴스]
${formatArticles(us)}

[산업 트렌드 뉴스]
${formatArticles(industry)}`;

  const response = await client.chat.completions.create({
    model: "gpt-4.1",
    messages: [
      {
        role: "system",
        content:
          "투자 전문 애널리스트로서 뉴스를 분석하고 투자자에게 유용한 형식으로 요약합니다.",
      },
      { role: "user", content: prompt },
    ],
  });

  return response.choices[0].message.content || "";
}

export async function runNewsCollection(): Promise<{
  message: string;
  collected: number;
  digest_preview: string;
}> {
  if (!supabase) {
    throw new Error("Supabase가 설정되지 않았습니다.");
  }

  const [macro, us, industry] = await Promise.all([
    fetchNews(QUERIES.macro, 8),
    fetchNews(QUERIES.us, 6),
    fetchNews(QUERIES.industry, 8),
  ]);

  const digest = await generateDigest(macro, us, industry);

  if (!digest) {
    throw new Error("다이제스트 생성 실패");
  }

  const today = new Date().toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const { error } = await supabase.from("news").insert({
    title: `일간 시장 요약 — ${today}`,
    summary: digest,
    industry: "digest",
    importance: "높음",
    url: `digest-${new Date().toISOString()}`,
  });

  if (error) {
    throw new Error(error.message);
  }

  return {
    message: "뉴스 수집 및 다이제스트 생성 완료",
    collected: macro.length + us.length + industry.length,
    digest_preview: digest.substring(0, 200) + "...",
  };
}
