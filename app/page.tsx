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
    <div className="flex flex-col h-screen bg-gray-950 text-white overflow-hidden">
      {/* 헤더 */}
      <header className="border-b border-gray-800 px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <span className="font-mono text-green-500 text-sm select-none">▸</span>
          <h1 className="font-mono text-sm text-gray-200 tracking-widest">
            AURUM AI
          </h1>
          <span className="font-mono text-xs text-gray-700 hidden sm:inline">
            — 투자 리서치 AI
          </span>
        </div>

        <div className="flex items-center gap-1">
          {/* 탭 */}
          <nav className="flex gap-1 mr-2">
            {(["chat", "journal"] as Tab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`font-mono text-xs px-3 py-1.5 border transition-colors ${
                  activeTab === tab
                    ? "border-green-800 text-green-400 bg-green-950"
                    : "border-gray-800 text-gray-600 hover:border-gray-700 hover:text-gray-400"
                }`}
              >
                {tab === "chat" ? "채팅" : "투자 일지"}
              </button>
            ))}
          </nav>

          {/* 뉴스 사이드바 토글 (채팅 탭에서만) */}
          {activeTab === "chat" && (
            <button
              onClick={() => setNewsSidebarOpen((prev) => !prev)}
              className={`font-mono text-xs px-3 py-1.5 border transition-colors hidden lg:block ${
                newsSidebarOpen
                  ? "border-gray-700 text-gray-400"
                  : "border-gray-800 text-gray-700"
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
            {/* 채팅 영역 */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
              <Chat
                pendingMessage={pendingMessage}
                pendingIncludeJournal={pendingIncludeJournal}
                onPendingConsumed={handlePendingConsumed}
              />
            </div>

            {/* 뉴스 사이드바 (데스크톱) */}
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
