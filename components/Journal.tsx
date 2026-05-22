"use client";

import { useState, useEffect, useCallback } from "react";
import type { JournalEntry } from "@/lib/supabase";

const MOOD_STYLE: Record<string, string> = {
  높음: "text-green-400 border-green-900",
  중간: "text-yellow-400 border-yellow-900",
  낮음: "text-gray-500 border-gray-700",
};

const ALL_TAGS = [
  "AI",
  "반도체",
  "전력 인프라",
  "우주 산업",
  "로봇",
  "자율주행",
  "국방 기술",
  "에너지",
  "원전",
];

type JournalProps = {
  onAIAnalysis: () => void;
};

type FormState = {
  title: string;
  content: string;
  tags: string[];
  mood: "높음" | "중간" | "낮음";
  tagInput: string;
};

const DEFAULT_FORM: FormState = {
  title: "",
  content: "",
  tags: [],
  mood: "중간",
  tagInput: "",
};

export default function Journal({ onAIAnalysis }: JournalProps) {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [filter, setFilter] = useState("전체");
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const fetchEntries = useCallback(async (tag: string) => {
    setLoading(true);
    try {
      const url =
        tag === "전체"
          ? "/api/journal"
          : `/api/journal?tag=${encodeURIComponent(tag)}`;
      const res = await fetch(url);
      const data = await res.json();
      setEntries(data.entries || []);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEntries(filter);
  }, [filter, fetchEntries]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          content: form.content,
          tags: form.tags,
          mood: form.mood,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "저장 실패");
      setEntries((prev) => [data.entry, ...prev]);
      setShowForm(false);
      setForm(DEFAULT_FORM);
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장 중 오류 발생");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("이 일지를 삭제하시겠습니까?")) return;
    try {
      const res = await fetch(`/api/journal/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch {
      alert("삭제 중 오류가 발생했습니다.");
    }
  }

  function toggleTag(tag: string) {
    setForm((prev) => ({
      ...prev,
      tags: prev.tags.includes(tag)
        ? prev.tags.filter((t) => t !== tag)
        : [...prev.tags, tag],
    }));
  }

  function addCustomTag() {
    const tag = form.tagInput.trim();
    if (tag && !form.tags.includes(tag)) {
      setForm((prev) => ({ ...prev, tags: [...prev.tags, tag], tagInput: "" }));
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
        <div>
          <h2 className="font-mono text-sm text-gray-300">INVESTMENT JOURNAL</h2>
          <p className="font-mono text-xs text-gray-400">
            {entries.length}개 기록됨
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onAIAnalysis}
            className="font-mono text-xs px-3 py-1.5 border border-green-900 text-green-600 hover:bg-green-950 transition-colors"
          >
            AI 분석 요청
          </button>
          <button
            onClick={() => setShowForm(!showForm)}
            className="font-mono text-xs px-3 py-1.5 border border-gray-600 text-gray-300 hover:border-gray-500 hover:text-gray-200 transition-colors"
          >
            {showForm ? "닫기" : "+ 새 일지"}
          </button>
        </div>
      </div>

      {/* 새 일지 폼 */}
      {showForm && (
        <div className="border-b border-gray-800 bg-gray-950 p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="font-mono text-xs text-gray-300 block mb-1">
                제목 *
              </label>
              <input
                className="w-full bg-gray-900 border border-gray-700 focus:border-green-700 outline-none px-3 py-2 font-mono text-sm text-gray-100 transition-colors placeholder-gray-600"
                placeholder="예: NVDA 매수 논리 정리"
                value={form.title}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, title: e.target.value }))
                }
                required
              />
            </div>

            <div>
              <label className="font-mono text-xs text-gray-300 block mb-1">
                내용 *
              </label>
              <textarea
                className="w-full bg-gray-900 border border-gray-700 focus:border-green-700 outline-none px-3 py-2 font-mono text-sm text-gray-100 transition-colors resize-none placeholder-gray-600"
                placeholder="투자 생각, 매수/매도 이유, 시장 해석..."
                rows={5}
                value={form.content}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, content: e.target.value }))
                }
                required
              />
            </div>

            <div>
              <label className="font-mono text-xs text-gray-300 block mb-2">
                태그
              </label>
              <div className="flex flex-wrap gap-1 mb-2">
                {ALL_TAGS.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={`px-2 py-0.5 font-mono text-xs border transition-colors ${
                      form.tags.includes(tag)
                        ? "border-green-700 text-green-400 bg-green-950"
                        : "border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-300"
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  className="flex-1 bg-gray-900 border border-gray-700 focus:border-green-700 outline-none px-3 py-1.5 font-mono text-xs text-gray-200 transition-colors placeholder-gray-600"
                  placeholder="직접 입력 후 Enter"
                  value={form.tagInput}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, tagInput: e.target.value }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCustomTag();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={addCustomTag}
                  className="font-mono text-xs px-3 py-1.5 border border-gray-700 text-gray-300 hover:text-gray-100 transition-colors"
                >
                  추가
                </button>
              </div>
              {form.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {form.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 font-mono text-xs border border-green-800 text-green-400 bg-green-950 flex items-center gap-1"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => toggleTag(tag)}
                        className="text-green-600 hover:text-green-300"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="font-mono text-xs text-gray-300 block mb-2">
                확신도 *
              </label>
              <div className="flex gap-2">
                {(["높음", "중간", "낮음"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, mood: m }))}
                    className={`px-4 py-1.5 font-mono text-xs border transition-colors ${
                      form.mood === m
                        ? MOOD_STYLE[m] + " bg-gray-900"
                        : "border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-300"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <p className="font-mono text-xs text-red-400">{error}</p>
            )}

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitting}
                className="font-mono text-xs px-4 py-2 bg-green-900 hover:bg-green-800 disabled:bg-gray-900 text-green-300 disabled:text-gray-600 border border-green-700 disabled:border-gray-800 transition-colors"
              >
                {submitting ? "저장 중..." : "저장"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setForm(DEFAULT_FORM);
                  setError("");
                }}
                className="font-mono text-xs px-4 py-2 border border-gray-700 text-gray-300 hover:text-gray-100 transition-colors"
              >
                취소
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 태그 필터 */}
      <div className="px-6 py-3 border-b border-gray-800 flex flex-wrap gap-1">
        {["전체", ...ALL_TAGS].map((tag) => (
          <button
            key={tag}
            onClick={() => setFilter(tag)}
            className={`px-2 py-0.5 font-mono text-xs border transition-colors ${
              filter === tag
                ? "border-green-800 text-green-400 bg-green-950"
                : "border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-300"
            }`}
          >
            {tag}
          </button>
        ))}
      </div>

      {/* 일지 목록 */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="p-6 font-mono text-xs text-gray-400 animate-pulse">
            일지 로딩 중...
          </div>
        )}

        {!loading && entries.length === 0 && (
          <div className="p-6 font-mono text-xs text-gray-400 space-y-1">
            <p>기록된 투자 일지가 없습니다.</p>
            <p className="text-gray-500">
              Supabase 설정 후 &apos;+ 새 일지&apos;를 작성해보세요.
            </p>
          </div>
        )}

        {entries.map((entry) => (
          <div
            key={entry.id}
            className="px-6 py-4 border-b border-gray-900 hover:bg-gray-950 transition-colors"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-mono text-xs text-gray-400">
                    {new Date(entry.created_at).toLocaleDateString("ko-KR")}
                  </span>
                  <span
                    className={`font-mono text-xs border px-1.5 ${MOOD_STYLE[entry.mood]}`}
                  >
                    확신도: {entry.mood}
                  </span>
                </div>
                <h3 className="font-mono text-sm text-gray-200 mb-2">
                  {entry.title}
                </h3>
                {entry.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {entry.tags.map((tag) => (
                      <span
                        key={tag}
                        className="font-mono text-xs border border-gray-700 text-gray-400 px-1.5 py-0.5"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                <p className="font-mono text-xs text-gray-400 leading-relaxed line-clamp-3">
                  {entry.content}
                </p>
              </div>
              <button
                onClick={() => handleDelete(entry.id)}
                className="font-mono text-xs text-gray-600 hover:text-red-500 transition-colors shrink-0"
                title="삭제"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
