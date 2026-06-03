"use client";

import { useState, useEffect, useCallback } from "react";

type DigestItem = {
  id: string;
  created_at: string;
  title: string;
  summary: string;
};

function renderDigest(content: string) {
  return content.split("\n").map((line, i) => {
    if (/^\[.+\]$/.test(line.trim())) {
      return (
        <p key={i} className="font-mono text-xs text-green-400 mt-5 mb-1 first:mt-0">
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
    if (line.trim() === "---" || line.trim() === "") return null;
    return (
      <p key={i} className="font-mono text-xs text-zinc-500 mb-1">
        {line}
      </p>
    );
  });
}

export default function NewsPage() {
  const [digests, setDigests] = useState<DigestItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [collectError, setCollectError] = useState<string | null>(null);
  const [collectSuccess, setCollectSuccess] = useState(false);

  const fetchDigests = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/news?industry=digest&limit=20");
      const data = await res.json();
      setDigests(data.news || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDigests();
  }, [fetchDigests]);

  async function handleCollect() {
    setCollecting(true);
    setCollectError(null);
    setCollectSuccess(false);
    try {
      const res = await fetch("/api/news/refresh", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setCollectError(data.error || "수집 중 오류가 발생했습니다.");
        return;
      }
      if (data.message) {
        setCollectSuccess(true);
        await fetchDigests();
        setTimeout(() => setCollectSuccess(false), 3000);
      }
    } catch {
      setCollectError("네트워크 오류가 발생했습니다.");
    } finally {
      setCollecting(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between shrink-0">
        <div>
          <h2 className="font-mono text-sm text-zinc-100 tracking-widest">MARKET DIGEST</h2>
          <p className="font-mono text-xs text-zinc-500 mt-0.5">
            매일 오전 8시 자동 수집 · 수동 수집 가능
          </p>
        </div>
        <div className="flex items-center gap-3">
          {collectSuccess && (
            <span className="font-mono text-xs text-green-400 animate-pulse">✓ 수집 완료</span>
          )}
          <button
            onClick={fetchDigests}
            disabled={loading}
            className="font-mono text-sm text-zinc-400 hover:text-green-400 disabled:text-zinc-700 transition-colors"
            title="새로고침"
          >
            {loading ? "…" : "↻"}
          </button>
          <button
            onClick={handleCollect}
            disabled={collecting}
            className="font-mono text-xs px-4 py-2 border border-zinc-700 text-zinc-300 hover:border-green-700 hover:text-green-400 disabled:text-zinc-600 disabled:border-zinc-800 transition-colors"
          >
            {collecting ? "수집 중... (약 60초)" : "지금 수집하기"}
          </button>
        </div>
      </div>

      {collectError && (
        <div className="px-6 py-2 border-b border-zinc-800 bg-red-950/30 shrink-0">
          <p className="font-mono text-xs text-red-400">{collectError}</p>
        </div>
      )}

      {/* 다이제스트 목록 */}
      <div className="flex-1 overflow-y-auto">
        {loading && !digests.length && (
          <div className="p-6 font-mono text-xs text-zinc-500 animate-pulse">
            불러오는 중...
          </div>
        )}

        {!loading && digests.length === 0 && (
          <div className="p-6 space-y-3">
            <p className="font-mono text-xs text-zinc-300">수집된 뉴스 요약이 없습니다.</p>
            <p className="font-mono text-xs text-zinc-500">
              오른쪽 상단 버튼으로 지금 바로 수집할 수 있어요.
            </p>
          </div>
        )}

        {digests.map((digest, index) => (
          <div
            key={digest.id}
            className={`px-6 py-5 ${index < digests.length - 1 ? "border-b border-zinc-800" : ""}`}
          >
            <p className="font-mono text-xs text-zinc-500 mb-3">
              {new Date(digest.created_at).toLocaleDateString("ko-KR", {
                year: "numeric",
                month: "long",
                day: "numeric",
                weekday: "short",
              })}
              {index === 0 && (
                <span className="ml-2 text-green-500 text-xs">● 최신</span>
              )}
            </p>
            {renderDigest(digest.summary)}
          </div>
        ))}
      </div>
    </div>
  );
}
