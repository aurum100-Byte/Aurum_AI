"use client";

import { useState, useCallback } from "react";
import Chat from "@/components/Chat";
import NewsSidebar from "@/components/NewsSidebar";
import NewsPage from "@/components/NewsPage";
import Journal from "@/components/Journal";
import DocumentsPage from "@/components/DocumentsPage";
import ConversationSidebar from "@/components/ConversationSidebar";

type Tab = "chat" | "news" | "journal" | "docs";

const TAB_LABELS: Record<Tab, string> = {
  chat: "채팅",
  news: "뉴스",
  journal: "투자 일지",
  docs: "리서치 문서",
};

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("chat");
  const [pendingMessage, setPendingMessage] = useState<string | undefined>();
  const [pendingIncludeJournal, setPendingIncludeJournal] = useState(false);
  const [newsSidebarOpen, setNewsSidebarOpen] = useState(true);

  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [sidebarRefreshKey, setSidebarRefreshKey] = useState(0);

  const handleAIAnalysis = useCallback(() => {
    setPendingMessage(
      "내 최근 투자 일지 5개를 기반으로 포트폴리오 방향성과 논리적 일관성을 분석해줘."
    );
    setPendingIncludeJournal(true);
    setActiveTab("chat");
  }, []);

  const handlePendingConsumed = useCallback(() => {
    setPendingMessage(undefined);
    setPendingIncludeJournal(false);
  }, []);

  const handleNewConversation = useCallback(() => {
    if (currentConversationId) {
      fetch(`/api/conversations/${currentConversationId}/summarize`, {
        method: "POST",
      }).catch(() => {});
    }
    setCurrentConversationId(null);
    setSidebarRefreshKey((k) => k + 1);
  }, [currentConversationId]);

  const handleSelectConversation = useCallback(
    (id: string) => {
      if (currentConversationId && currentConversationId !== id) {
        fetch(`/api/conversations/${currentConversationId}/summarize`, {
          method: "POST",
        }).catch(() => {});
      }
      setCurrentConversationId(id);
    },
    [currentConversationId]
  );

  const handleConversationCreated = useCallback((id: string) => {
    setCurrentConversationId(id);
    setSidebarRefreshKey((k) => k + 1);
  }, []);

  const handleRefreshSidebar = useCallback(() => {
    setSidebarRefreshKey((k) => k + 1);
  }, []);

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-white overflow-hidden">
      {/* 헤더 */}
      <header className="border-b border-zinc-800 px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <span className="font-mono text-green-400 text-sm select-none">▸</span>
          <h1 className="font-mono text-sm text-white tracking-widest">AURUM AI</h1>
          <span className="font-mono text-xs text-zinc-500 hidden sm:inline">
            — 투자 리서치 AI
          </span>
        </div>

        <div className="flex items-center gap-1">
          <nav className="flex gap-1 mr-2">
            {(["chat", "news", "journal", "docs"] as Tab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`font-mono text-xs px-3 py-1.5 border transition-colors ${
                  activeTab === tab
                    ? "border-green-700 text-green-400 bg-green-950"
                    : "border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white"
                }`}
              >
                {TAB_LABELS[tab]}
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
        {/* 채팅 탭 */}
        {activeTab === "chat" && (
          <>
            <div className="hidden md:flex flex-col w-52 shrink-0 overflow-hidden">
              <ConversationSidebar
                currentId={currentConversationId}
                onSelect={handleSelectConversation}
                onNew={handleNewConversation}
                refreshKey={sidebarRefreshKey}
              />
            </div>
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
              <Chat
                conversationId={currentConversationId}
                onConversationCreated={handleConversationCreated}
                onRefreshSidebar={handleRefreshSidebar}
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

        {/* 뉴스 탭 */}
        {activeTab === "news" && (
          <div className="flex-1 overflow-hidden">
            <NewsPage />
          </div>
        )}

        {/* 투자 일지 탭 */}
        {activeTab === "journal" && (
          <div className="flex-1 overflow-hidden">
            <Journal onAIAnalysis={handleAIAnalysis} />
          </div>
        )}

        {/* 리서치 문서 탭 */}
        {activeTab === "docs" && (
          <div className="flex-1 overflow-hidden">
            <DocumentsPage />
          </div>
        )}
      </main>
    </div>
  );
}
