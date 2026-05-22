import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { supabase } from "@/lib/supabase";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const KEYWORDS = [
  { query: "artificial intelligence AI LLM", industry: "AI" },
  { query: "semiconductor chip TSMC NVIDIA AMD", industry: "반도체" },
  { query: "power grid electricity infrastructure data center", industry: "전력 인프라" },
  { query: "space industry SpaceX satellite rocket launch", industry: "우주 산업" },
  { query: "robotics humanoid robot automation Boston Dynamics", industry: "로봇" },
  { query: "autonomous driving self-driving vehicle Waymo Tesla", industry: "자율주행" },
  { query: "defense technology military drone weapon", industry: "국방 기술" },
  { query: "renewable energy solar wind battery storage", industry: "에너지" },
  { query: "nuclear energy nuclear power reactor SMR", industry: "원전" },
];

async function fetchArticles(query: string): Promise<
  { title: string; description: string; url: string }[]
> {
  const apiKey = process.env.NEWS_API_KEY;
  if (!apiKey) return [];

  const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&language=en&sortBy=publishedAt&pageSize=3&apiKey=${apiKey}`;
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) return [];

  const data = await res.json();
  return (data.articles || []).filter(
    (a: { title?: string; url?: string }) => a.title && a.url
  );
}

async function summarize(
  title: string,
  description: string
): Promise<{ summary: string; importance: "높음" | "중간" | "낮음" }> {
  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "투자 관점에서 뉴스를 분석하는 AI입니다. 반드시 JSON으로만 답변하세요.",
      },
      {
        role: "user",
        content: `다음 뉴스를 투자 관점에서 분석해주세요.
제목: ${title}
내용: ${description || "(내용 없음)"}

JSON 형식으로만 답변:
{"summary":"핵심 내용 1-2줄 (한국어)","importance":"높음|중간|낮음"}`,
      },
    ],
    response_format: { type: "json_object" },
  });

  try {
    const parsed = JSON.parse(response.choices[0].message.content || "{}");
    return {
      summary: parsed.summary || description?.substring(0, 100) || "",
      importance: parsed.importance || "중간",
    };
  } catch {
    return {
      summary: description?.substring(0, 100) || "",
      importance: "중간",
    };
  }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase가 설정되지 않았습니다." },
      { status: 500 }
    );
  }

  const results = { collected: 0, skipped: 0, errors: 0 };

  for (const { query, industry } of KEYWORDS) {
    try {
      const articles = await fetchArticles(query);

      for (const article of articles.slice(0, 2)) {
        const { data: existing } = await supabase
          .from("news")
          .select("id")
          .eq("url", article.url)
          .maybeSingle();

        if (existing) {
          results.skipped++;
          continue;
        }

        const { summary, importance } = await summarize(
          article.title,
          article.description || ""
        );

        const { error } = await supabase.from("news").insert({
          title: article.title,
          summary,
          industry,
          importance,
          url: article.url,
        });

        if (error) {
          console.error(`Insert error for ${article.url}:`, error);
          results.errors++;
        } else {
          results.collected++;
        }
      }
    } catch (err) {
      console.error(`Failed to process ${industry}:`, err);
      results.errors++;
    }
  }

  return NextResponse.json({ message: "뉴스 수집 완료", ...results });
}
