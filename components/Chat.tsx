"use client";

import { useState, useRef, useEffect } from "react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type ChatProps = {
  pendingMessage?: string;
  pendingIncludeJournal?: boolean;
  onPendingConsumed?: () => void;
};

export default function Chat({
  pendingMessage,
  pendingIncludeJournal,
  onPendingConsumed,
}: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [includeJournal, setIncludeJournal] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (pendingMessage) {
      setIncludeJournal(pendingIncludeJournal ?? false);
      sendMessage(pendingMessage, pendingIncludeJournal ?? false);
      onPendingConsumed?.();
    }
  }, [pendingMessage]);

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

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages,
          includeJournal: withJournal,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            err instanceof Error ? err.message : "오류가 발생했습니다. 다시 시도해주세요.",
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
        {messages.length === 0 && (
          <div className="text-gray-400 text-sm font-mono mt-8 space-y-1">
            <p className="text-green-400">{"// AURUM AI 투자 리서치"}</p>
            <p>{"// 산업 분석, 종목 발굴, 투자 논리 검토"}</p>
            <p className="mt-4 text-gray-300">
              {"> 무엇이든 물어보세요. 반박도 합니다."}
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex flex-col gap-1 ${msg.role === "user" ? "items-end" : "items-start"}`}>
            <span className="text-xs font-mono text-gray-400">
              {msg.role === "user" ? "YOU" : "AI"}
            </span>
            <div
              className={`max-w-[85%] px-4 py-3 font-mono text-sm leading-relaxed whitespace-pre-wrap break-words ${
                msg.role === "user"
                  ? "bg-gray-800 border border-gray-700 text-gray-100 rounded-tl-lg rounded-bl-lg rounded-br-lg"
                  : "bg-gray-900 border border-gray-800 text-green-300 rounded-tr-lg rounded-bl-lg rounded-br-lg border-l-2 border-l-green-800"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex flex-col items-start gap-1">
            <span className="text-xs font-mono text-gray-600">AI</span>
            <div className="bg-gray-900 border border-gray-800 border-l-2 border-l-green-800 px-4 py-3 rounded-tr-lg rounded-bl-lg rounded-br-lg">
              <span className="font-mono text-sm text-green-600 animate-pulse">
                분석 중...
              </span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* 입력 영역 */}
      <div className="border-t border-gray-800 p-4 space-y-2">
        <div className="flex gap-2">
          <span className="font-mono text-green-400 self-center text-sm select-none">
            {">"}
          </span>
          <input
            ref={inputRef}
            className="flex-1 bg-transparent border-none outline-none font-mono text-sm text-gray-100 placeholder-gray-500"
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
          <button
            onClick={() => sendMessage()}
            disabled={loading || !input.trim()}
            className="px-4 py-1.5 bg-green-900 hover:bg-green-800 disabled:bg-gray-900 disabled:text-gray-600 text-green-300 font-mono text-xs border border-green-800 disabled:border-gray-800 transition-colors"
          >
            SEND
          </button>
        </div>
        <div className="flex items-center gap-2 pl-4">
          <input
            type="checkbox"
            id="include-journal"
            checked={includeJournal}
            onChange={(e) => setIncludeJournal(e.target.checked)}
            className="accent-green-600"
          />
          <label
            htmlFor="include-journal"
            className="text-xs font-mono text-gray-400 cursor-pointer hover:text-gray-200"
          >
            투자 일지 컨텍스트 포함
          </label>
        </div>
      </div>
    </div>
  );
}
