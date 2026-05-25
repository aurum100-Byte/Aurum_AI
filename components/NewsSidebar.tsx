"use client";

import { useState, useEffect, useCallback } from "react";

type DigestItem = {
  id: string;
  created_at: string;
  title: string;
  summary: string;
};

function renderDigest(content: string) {
  const lines = content.split("\n");
  return lines.map((line, i) => {
    if (/^\[.+\]$/.test(line.trim())) {
      return (
        <p key={i} className="font-mono text-xs text-green-400 mt-4 mb-1 first:mt-0">
          {line.trim()}
        </p>
      );
    }
    if (/^\d+\.\s/.test(line.trim())) {
      const match = line.match(/^(\d+\.\s)(\([^)]+\))?(.*)$/);
      if (match) {
        return (
          <p key={i} className="font-mono text-xs text-zinc-300 mb-2 leading-relaxed pl-1">
            <span className="text-zinc-500">{match[1]}</span>
            {match[2] && <span className="text-amber-400">{match[2]}</span>}
            {match[3]}
          </p>
        );
      }
    }
    if (line.trim() === "---" || line.trim() === "") {
      return null;
    }
    return (
      <p key={i} className="font-mono text-xs text-zinc-500 mb-1">
        {line}
      </p>
    );
  });
}

export default function NewsSidebar() {
  const [digest, setDigest] = useState<DigestItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [collectError, setCollectError] = useState<string | null>(null);

  const fetchDigest = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/news?industry=digest&limit=1");
      const data = await res.json();
      setDigest(data.news?.[0] || null);
    } catch {
      setDigest(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDigest();
  }, [fetchDigest]);

  async function handleCollect() {
    setCollecting(true);
    setCollectError(null);
    try {
      const res = await fetch("/api/news/refresh", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setCollectError(data.error || "수집 중 오류가 발생했습니다.");
        return;
      }
      if (data.message) {
        await fetchDigest();
      }
    } catch {
      setCollectError("네트워크 오류가 발생했습니다.");
    } finally {
      setCollecting(false);
    }
  }

  return (
    <div className="flex flex-col h-full border-l border-zinc-800">
      {/* 헤더 */}
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between shrink-0">
        <span className="font-mono text-xs text-zinc-200 tracking-widest">
          MARKET DIGEST
          {digest && (
            <span className="ml-2 text-zinc-500 tracking-normal text-xs">
              {new Date(digest.created_at).toLocaleDateString("ko-KR")}
            </span>
          )}
        </span>
        <button
          onClick={fetchDigest}
          disabled={loading}
          className="font-mono text-sm text-zinc-400 hover:text-green-400 disabled:text-zinc-700 transition-colors"
        >
          {loading ? "…" : "↻"}
        </button>
      </div>

      {/* 콘텐츠 */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {loading && (
          <p className="font-mono text-xs text-zinc-500 animate-pulse">로딩 중...</p>
        )}

        {!loading && !digest && (
          <div className="space-y-3">
            <p className="font-mono text-xs text-zinc-300">수집된 뉴스 요약이 없습니다.</p>
            <p className="font-mono text-xs text-zinc-500">
              아래 버튼으로 지금 바로 수집할 수 있어요.
            </p>
            {collectError && (
              <p className="font-mono text-xs text-red-400 break-words">{collectError}</p>
            )}
            <button
              onClick={handleCollect}
              disabled={collecting}
              className="font-mono text-xs px-3 py-1.5 border border-green-800 text-green-400 hover:bg-green-950 disabled:text-zinc-600 disabled:border-zinc-800 transition-colors w-full"
            >
              {collecting ? "수집 중... (약 60초)" : "뉴스 지금 수집하기"}
            </button>
          </div>
        )}

        {!loading && digest && (
          <div>
            <p className="font-mono text-xs text-zinc-500 mb-3">{digest.title}</p>
            {renderDigest(digest.summary)}
          </div>
        )}
      </div>

      {/* 하단 수집 버튼 */}
      {digest && (
        <div className="px-4 py-3 border-t border-zinc-800 shrink-0 space-y-2">
          {collectError && (
            <p className="font-mono text-xs text-red-400 break-words">{collectError}</p>
          )}
          <button
            onClick={handleCollect}
            disabled={collecting}
            className="font-mono text-xs px-3 py-1.5 border border-zinc-700 text-zinc-400 hover:border-green-800 hover:text-green-400 disabled:text-zinc-700 disabled:border-zinc-800 transition-colors w-full"
          >
            {collecting ? "수집 중... (약 60초)" : "새로 수집하기"}
          </button>
        </div>
      )}
    </div>
  );
}
