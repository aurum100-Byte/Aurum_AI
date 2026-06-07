"use client";

import { useState, useRef, useEffect } from "react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type ChatProps = {
  conversationId: string | null;
  onConversationCreated?: (id: string) => void;
  onRefreshSidebar?: () => void;
  pendingMessage?: string;
  pendingIncludeJournal?: boolean;
  onPendingConsumed?: () => void;
};

export default function Chat({
  conversationId,
  onConversationCreated,
  onRefreshSidebar,
  pendingMessage,
  pendingIncludeJournal,
  onPendingConsumed,
}: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [includeJournal, setIncludeJournal] = useState(false);
  const [activeConvId, setActiveConvId] = useState<string | null>(conversationId);
  const [uploadingFiles, setUploadingFiles] = useState<string[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // prop → 로컬 state 동기화
  useEffect(() => {
    setActiveConvId(conversationId);
  }, [conversationId]);

  // activeConvId 변경 시 메시지 로드
  useEffect(() => {
    if (!activeConvId) {
      setMessages([]);
      return;
    }
    setLoadingHistory(true);
    fetch(`/api/conversations/${activeConvId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.messages) {
          setMessages(
            data.messages.map((m: { role: string; content: string }) => ({
              role: m.role as "user" | "assistant",
              content: m.content,
            }))
          );
        }
      })
      .catch(() => setMessages([]))
      .finally(() => setLoadingHistory(false));
  }, [activeConvId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // 입력창 높이 자동 조절
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, [input]);

  useEffect(() => {
    if (pendingMessage) {
      setIncludeJournal(pendingIncludeJournal ?? false);
      sendMessage(pendingMessage, pendingIncludeJournal ?? false);
      onPendingConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingMessage]);

  async function handlePdfUpload(files: FileList) {
    const validFiles = Array.from(files).filter((f) =>
      f.name.toLowerCase().endsWith(".pdf")
    );
    if (validFiles.length === 0) return;

    setUploadingFiles(validFiles.map((f) => f.name));

    const failed: string[] = [];

    for (const file of validFiles) {
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/documents/upload", {
          method: "POST",
          body: formData,
        });
        if (!res.ok) failed.push(file.name);
      } catch {
        failed.push(file.name);
      }
    }

    setUploadingFiles([]);

    if (failed.length === 0) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "📎 분석 완료" },
      ]);
    } else {
      const ok = validFiles.length - failed.length;
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            ok > 0
              ? `📎 ${ok}개 분석 완료 / 실패: ${failed.join(", ")}`
              : `📎 분석 실패: ${failed.join(", ")}`,
        },
      ]);
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function sendMessage(
    text: string = input,
    withJournal: boolean = includeJournal
  ) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    if (text === input) setInput("");

    const userMsg: Message = { role: "user", content: trimmed };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setLoading(true);

    const isFirstMessage = messages.length === 0;

    // 대화 없으면 새로 생성
    let convId = activeConvId;
    if (!convId) {
      try {
        const res = await fetch("/api/conversations", { method: "POST" });
        const data = await res.json();
        convId = data.conversation?.id ?? null;
        if (convId) {
          setActiveConvId(convId);
          onConversationCreated?.(convId);
        }
      } catch {
        // DB 저장 없이 계속
      }
    }

    // 사용자 메시지 저장 (fire-and-forget)
    if (convId) {
      fetch(`/api/conversations/${convId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "user", content: trimmed }),
      }).catch(() => {});
    }

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages,
          includeJournal: withJournal,
          conversationId: convId,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const reply = data.reply as string;
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);

      // AI 응답 저장 (fire-and-forget)
      if (convId) {
        fetch(`/api/conversations/${convId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: "assistant", content: reply }),
        }).catch(() => {});
      }

      // 첫 메시지 후 제목 자동 생성 (fire-and-forget)
      if (convId && isFirstMessage) {
        fetch(`/api/conversations/${convId}/title`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ firstMessage: trimmed }),
        })
          .then(() => onRefreshSidebar?.())
          .catch(() => {});
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            err instanceof Error
              ? err.message
              : "오류가 발생했습니다. 다시 시도해주세요.",
        },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* 메시지 영역 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        {loadingHistory && (
          <p className="font-mono text-xs text-zinc-500 animate-pulse mt-8">
            대화 불러오는 중...
          </p>
        )}

        {!loadingHistory && messages.length === 0 && (
          <div className="font-mono text-sm mt-8 space-y-1">
            <p className="text-green-400">{"// AURUM AI 투자 리서치"}</p>
            <p className="text-zinc-400">{"// 산업 분석, 종목 발굴, 투자 논리 검토"}</p>
            <p className="mt-4 text-zinc-200">{"> 무엇이든 물어보세요. 반박도 합니다."}</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex flex-col gap-1 ${
              msg.role === "user" ? "items-end" : "items-start"
            }`}
          >
            <span
              className={`text-xs font-mono ${
                msg.role === "user" ? "text-zinc-400" : "text-green-500"
              }`}
            >
              {msg.role === "user" ? "YOU" : "AI"}
            </span>
            <div
              className={`max-w-[85%] px-4 py-3 font-mono text-sm leading-relaxed whitespace-pre-wrap break-words ${
                msg.role === "user"
                  ? "bg-zinc-800 border border-zinc-700 text-zinc-100 rounded-tl-lg rounded-bl-lg rounded-br-lg"
                  : "bg-gray-900 border border-gray-800 text-green-300 rounded-tr-lg rounded-bl-lg rounded-br-lg border-l-2 border-l-green-700"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex flex-col items-start gap-1">
            <span className="text-xs font-mono text-green-500">AI</span>
            <div className="bg-gray-900 border border-gray-800 border-l-2 border-l-green-700 px-4 py-3 rounded-tr-lg rounded-bl-lg rounded-br-lg">
              <span className="font-mono text-sm text-green-400 animate-pulse">
                분석 중...
              </span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* 입력 영역 */}
      <div className="border-t border-zinc-800 p-4 space-y-2">
        <div className="relative pr-20">
          <div className="flex gap-2">
            <span className="font-mono text-green-400 self-start mt-[3px] text-sm select-none">
              {">"}
            </span>
            <textarea
              ref={inputRef}
              rows={1}
              className="flex-1 bg-transparent border-none outline-none font-mono text-sm text-zinc-100 placeholder-zinc-500 resize-none overflow-y-auto leading-relaxed"
              placeholder="질문 또는 종목/산업 분석 요청..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              disabled={loading}
              autoFocus
            />
          </div>
          <button
            onClick={() => sendMessage()}
            disabled={loading || !input.trim()}
            className="absolute top-0 right-0 px-4 py-1.5 bg-green-900 hover:bg-green-800 disabled:bg-zinc-900 disabled:text-zinc-600 text-green-300 font-mono text-xs border border-green-800 disabled:border-zinc-800 transition-colors"
          >
            SEND
          </button>
        </div>
        <div className="flex items-center justify-between pl-4">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="include-journal"
              checked={includeJournal}
              onChange={(e) => setIncludeJournal(e.target.checked)}
              className="accent-green-500"
            />
            <label
              htmlFor="include-journal"
              className="text-xs font-mono text-zinc-400 cursor-pointer hover:text-zinc-200"
            >
              투자 일지 컨텍스트 포함
            </label>
          </div>

          {/* PDF 업로드 */}
          <div className="flex items-center gap-2">
            {uploadingFiles.length > 0 && (
              <span className="font-mono text-xs text-zinc-500 animate-pulse">
                {uploadingFiles[0]} 분석 중...
              </span>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              multiple
              className="hidden"
              onChange={(e) => e.target.files && handlePdfUpload(e.target.files)}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingFiles.length > 0}
              className="font-mono text-xs px-3 py-1 border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 disabled:text-zinc-700 disabled:border-zinc-800 transition-colors"
              title="PDF 업로드 (최대 10개)"
            >
              📎 PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
