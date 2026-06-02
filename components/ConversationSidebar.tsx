"use client";

import { useState, useEffect, useCallback } from "react";

type Conversation = {
  id: string;
  created_at: string;
  title: string;
  summary: string;
};

function groupByDate(conversations: Conversation[]): [string, Conversation[]][] {
  const groups: Record<string, Conversation[]> = {};
  const today = new Date().toLocaleDateString("ko-KR");
  const yesterday = new Date(Date.now() - 86400000).toLocaleDateString("ko-KR");

  for (const conv of conversations) {
    const date = new Date(conv.created_at).toLocaleDateString("ko-KR");
    const label = date === today ? "오늘" : date === yesterday ? "어제" : date;
    if (!groups[label]) groups[label] = [];
    groups[label].push(conv);
  }
  return Object.entries(groups);
}

type Props = {
  currentId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  refreshKey: number;
};

export default function ConversationSidebar({
  currentId,
  onSelect,
  onNew,
  refreshKey,
}: Props) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchConversations = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/conversations");
      const data = await res.json();
      setConversations(data.conversations || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations, refreshKey]);

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    if (!confirm("이 대화를 삭제할까요?")) return;
    try {
      await fetch(`/api/conversations/${id}`, { method: "DELETE" });
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (currentId === id) onNew();
    } catch {
      // silent
    }
  }

  const grouped = groupByDate(conversations);

  return (
    <div className="flex flex-col h-full border-r border-zinc-800 bg-zinc-950">
      {/* 헤더 */}
      <div className="px-3 py-3 border-b border-zinc-800 shrink-0">
        <button
          onClick={onNew}
          className="w-full font-mono text-xs px-3 py-2 border border-zinc-700 text-zinc-300 hover:border-green-700 hover:text-green-400 transition-colors"
        >
          + 새 대화
        </button>
      </div>

      {/* 대화 목록 */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <p className="font-mono text-xs text-zinc-600 p-3 animate-pulse">
            불러오는 중...
          </p>
        )}

        {!loading && conversations.length === 0 && (
          <p className="font-mono text-xs text-zinc-600 p-3 leading-relaxed">
            아직 대화 기록이 없어요.
          </p>
        )}

        {grouped.map(([dateLabel, convs]) => (
          <div key={dateLabel}>
            <p className="font-mono text-xs text-zinc-600 px-3 py-1.5 bg-zinc-900/60 sticky top-0">
              {dateLabel}
            </p>
            {convs.map((conv) => (
              <div
                key={conv.id}
                onClick={() => onSelect(conv.id)}
                className={`group flex items-center justify-between px-3 py-2.5 cursor-pointer transition-colors border-b border-zinc-900 ${
                  currentId === conv.id
                    ? "bg-zinc-800 border-l-2 border-l-green-500"
                    : "hover:bg-zinc-900"
                }`}
              >
                <span
                  className={`font-mono text-xs truncate flex-1 leading-snug ${
                    currentId === conv.id ? "text-zinc-100" : "text-zinc-400"
                  }`}
                >
                  {conv.title}
                </span>
                <button
                  onClick={(e) => handleDelete(e, conv.id)}
                  className="opacity-0 group-hover:opacity-100 ml-1 shrink-0 font-mono text-xs text-zinc-600 hover:text-red-400 transition-all"
                  title="삭제"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
