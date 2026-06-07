"use client";

import { useState, useEffect, useCallback } from "react";

type Document = {
  id: string;
  created_at: string;
  file_name: string;
  summary: string;
  tags: string[];
  objective_data: string;
  subjective_opinion: string;
  ai_opinion: string;
};

type ExpandedSection = "summary" | "objective" | "subjective" | "ai" | null;

function DocumentCard({ doc, onDelete }: { doc: Document; onDelete: (id: string) => void }) {
  const [expanded, setExpanded] = useState<ExpandedSection>(null);

  function toggle(section: ExpandedSection) {
    setExpanded((prev) => (prev === section ? null : section));
  }

  return (
    <div className="border-b border-zinc-800 px-6 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="font-mono text-xs text-zinc-500">
              {new Date(doc.created_at).toLocaleDateString("ko-KR", {
                year: "numeric", month: "long", day: "numeric",
              })}
            </span>
          </div>
          <p className="font-mono text-sm text-zinc-100 mb-2 truncate">{doc.file_name}</p>
          {doc.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-3">
              {doc.tags.map((tag) => (
                <span
                  key={tag}
                  className="font-mono text-xs border border-zinc-700 text-zinc-400 px-1.5 py-0.5"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* 섹션 토글 버튼 */}
          <div className="flex flex-wrap gap-1">
            {[
              { key: "summary" as const, label: "요약" },
              { key: "objective" as const, label: "팩트" },
              { key: "subjective" as const, label: "작성자 의견" },
              { key: "ai" as const, label: "AI 의견" },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => toggle(key)}
                className={`font-mono text-xs px-2 py-0.5 border transition-colors ${
                  expanded === key
                    ? "border-green-700 text-green-400 bg-green-950"
                    : "border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* 확장 내용 */}
          {expanded && (
            <div className="mt-3 p-3 bg-zinc-900 border border-zinc-800">
              <p className="font-mono text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap">
                {expanded === "summary" && (doc.summary || "-")}
                {expanded === "objective" && (doc.objective_data || "-")}
                {expanded === "subjective" && (doc.subjective_opinion || "-")}
                {expanded === "ai" && (doc.ai_opinion || "-")}
              </p>
            </div>
          )}
        </div>

        <button
          onClick={() => onDelete(doc.id)}
          className="font-mono text-xs text-zinc-600 hover:text-red-400 transition-colors shrink-0 mt-1"
          title="삭제"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/documents");
      const data = await res.json();
      setDocuments(data.documents || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  async function handleDelete(id: string) {
    if (!confirm("이 문서를 삭제하시겠습니까?")) return;
    try {
      await fetch(`/api/documents/${id}`, { method: "DELETE" });
      setDocuments((prev) => prev.filter((d) => d.id !== id));
    } catch {
      // silent
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between shrink-0">
        <div>
          <h2 className="font-mono text-sm text-zinc-100 tracking-widest">RESEARCH DOCS</h2>
          <p className="font-mono text-xs text-zinc-500 mt-0.5">
            {documents.length}개 저장됨 · 채팅창 하단 📎 버튼으로 PDF 업로드
          </p>
        </div>
        <button
          onClick={fetchDocuments}
          disabled={loading}
          className="font-mono text-sm text-zinc-400 hover:text-green-400 disabled:text-zinc-700 transition-colors"
          title="새로고침"
        >
          {loading ? "…" : "↻"}
        </button>
      </div>

      {/* 문서 목록 */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="p-6 font-mono text-xs text-zinc-500 animate-pulse">
            불러오는 중...
          </div>
        )}

        {!loading && documents.length === 0 && (
          <div className="p-6 space-y-2">
            <p className="font-mono text-xs text-zinc-300">저장된 리서치 문서가 없습니다.</p>
            <p className="font-mono text-xs text-zinc-500">
              채팅 탭 하단의 📎 PDF 버튼으로 업로드할 수 있어요.
            </p>
          </div>
        )}

        {documents.map((doc) => (
          <DocumentCard key={doc.id} doc={doc} onDelete={handleDelete} />
        ))}
      </div>
    </div>
  );
}
