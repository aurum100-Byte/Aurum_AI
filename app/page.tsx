"use client";

import { useState, useCallback } from "react";
import Chat from "@/components/Chat";
import NewsSidebar from "@/components/NewsSidebar";
import Journal from "@/components/Journal";

type Tab = "chat" | "journal";

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("chat");
  const [pendingMessage, setPendingMessage] = useState<string | undefined>();
  const [pendingIncludeJournal, setPendingIncludeJournal] = useState(false);
  const [newsSidebarOpen, setNewsSidebarOpen] = useState(true);

  const handleAIAnalysis = useCallback(() => {
    setPendingMessage("내 최근 투자 일지 5개를 기반으로 포트폴리오 방향성과 논리적 일관성을 분석해줘.");
    setPendingIncludeJournal(true);
    setActiveTab("chat");
  }, []);

  const handlePendingConsumed = useCallback(() => {
    setPendingMessage(undefined);
    setPendingIncludeJournal(false);
  }, []);

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-white overflow-hidden">
      {/* 헤더 */}
      <header className="border-b border-zinc-800 px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <span className="font-mono text-green-400 text-sm select-none">▸</span>
          <h1 className="font-mono text-sm text-white tracking-widest">AURUM AI</h1>
          <span className="font-mono text-xs text-zinc-500 hidden sm:inline">— 투자 리서치 AI</span>
        </div>

        <div className="flex items-center gap-1">
          <nav className="flex gap-1 mr-2">
            {(["chat", "journal"] as Tab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`font-mono text-xs px-3 py-1.5 border transition-colors ${
                  activeTab === tab
                    ? "border-green-700 text-green-400 bg-green-950"
                    : "border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white"
                }`}
              >
                {tab === "chat" ? "채팅" : "투자 일지"}
              </button>
            ))}
          </nav>

          {activeTab === "chat" && (
            <button
              onClick={() => setNewsSidebarOpen((prev) => !prev)}
              className={`font-mono text-xs px-3 py-1.5 border transition-colors hidden lg:block ${
                newsSidebarOpen
                  ? "border-zinc-600 text-zinc-300"
                  : "border-zinc-800 text-zinc-500"
              }`}
              title="뉴스 사이드바 토글"
            >
              뉴스 {newsSidebarOpen ? "◀" : "▶"}
            </button>
          )}
        </div>
      </header>

      {/* 메인 콘텐츠 */}
      <main className="flex-1 flex overflow-hidden min-h-0">
        {activeTab === "chat" && (
          <>
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
              <Chat
                pendingMessage={pendingMessage}
                pendingIncludeJournal={pendingIncludeJournal}
                onPendingConsumed={handlePendingConsumed}
              />
            </div>
            {newsSidebarOpen && (
              <div className="hidden lg:flex flex-col w-80 shrink-0 overflow-hidden">
                <NewsSidebar />
              </div>
            )}
          </>
        )}

        {activeTab === "journal" && (
          <div className="flex-1 overflow-hidden">
            <Journal onAIAnalysis={handleAIAnalysis} />
          </div>
        )}
      </main>
    </div>
  );
}
