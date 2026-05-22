"use client";

import { useState, useEffect, useCallback } from "react";
import type { NewsItem } from "@/lib/supabase";

const INDUSTRIES = [
  "전체", "AI", "반도체", "전력 인프라", "우주 산업",
  "로봇", "자율주행", "국방 기술", "에너지", "원전",
];

const IMPORTANCE_STYLE: Record<string, string> = {
  높음: "text-red-400 border-red-800",
  중간: "text-amber-400 border-amber-800",
  낮음: "text-zinc-400 border-zinc-700",
};

export default function NewsSidebar() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [filter, setFilter] = useState("전체");
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const fetchNews = useCallback(async (industry: string) => {
    setLoading(true);
    try {
      const url =
        industry === "전체"
          ? "/api/news?limit=20"
          : `/api/news?industry=${encodeURIComponent(industry)}&limit=20`;
      const res = await fetch(url);
      const data = await res.json();
      setNews(data.news || []);
      setLastUpdated(new Date().toLocaleTimeString("ko-KR"));
    } catch {
      setNews([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNews(filter);
  }, [filter, fetchNews]);

  return (
    <div className="flex flex-col h-full border-l border-zinc-800">
      {/* 헤더 */}
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
        <span className="font-mono text-xs text-zinc-200 tracking-widest">
          MARKET NEWS
          {lastUpdated && (
            <span className="ml-2 text-zinc-500 tracking-normal">{lastUpdated}</span>
          )}
        </span>
        <button
          onClick={() => fetchNews(filter)}
          disabled={loading}
          className="font-mono text-sm text-zinc-400 hover:text-green-400 disabled:text-zinc-700 transition-colors"
        >
          {loading ? "…" : "↻"}
        </button>
      </div>

      {/* 필터 */}
      <div className="px-3 py-2 border-b border-zinc-800 flex flex-wrap gap-1">
        {INDUSTRIES.map((ind) => (
          <button
            key={ind}
            onClick={() => setFilter(ind)}
            className={`px-2 py-0.5 font-mono text-xs border transition-colors ${
              filter === ind
                ? "border-green-700 text-green-400 bg-green-950"
                : "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
            }`}
          >
            {ind}
          </button>
        ))}
      </div>

      {/* 뉴스 목록 */}
      <div className="flex-1 overflow-y-auto">
        {loading && news.length === 0 && (
          <div className="p-4 font-mono text-xs text-zinc-400 animate-pulse">
            뉴스 로딩 중...
          </div>
        )}

        {!loading && news.length === 0 && (
          <div className="p-4 font-mono text-xs space-y-1">
            <p className="text-zinc-300">수집된 뉴스가 없습니다.</p>
            <p className="text-zinc-500">NEWS_API_KEY 설정 후</p>
            <p className="text-zinc-500">/api/news/collect 를 호출하세요.</p>
          </div>
        )}

        {news.map((item) => (
          <div
            key={item.id}
            className="px-4 py-3 border-b border-zinc-900 hover:bg-zinc-900 transition-colors"
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-xs text-zinc-400">{item.industry}</span>
              <span className={`font-mono text-xs border px-1 ${IMPORTANCE_STYLE[item.importance] || IMPORTANCE_STYLE["낮음"]}`}>
                {item.importance}
              </span>
            </div>
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-xs text-zinc-100 hover:text-green-400 transition-colors leading-snug block"
            >
              {item.title}
            </a>
            <p className="font-mono text-xs text-zinc-400 mt-1 leading-snug">
              {item.summary}
            </p>
            <span className="font-mono text-xs text-zinc-600">
              {new Date(item.created_at).toLocaleDateString("ko-KR")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
