"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { YoutubeChannel } from "@/lib/supabase";

type SSEEvent = {
  type: "status" | "progress" | "done" | "batch-done" | "error";
  message: string;
  current?: number;
  total?: number;
  nextIndex?: number;
  processed?: number;
  skipped?: number;
  failed?: number;
};

export default function YoutubeIngest() {
  const [channelUrl, setChannelUrl] = useState("");
  const [isIngesting, setIsIngesting] = useState(false);
  const [logs, setLogs] = useState<{ text: string; type: string }[]>([]);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [channels, setChannels] = useState<YoutubeChannel[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(true);
  const logEndRef = useRef<HTMLDivElement>(null);

  const loadChannels = useCallback(async () => {
    setLoadingChannels(true);
    try {
      const res = await fetch("/api/youtube/channels");
      const data = await res.json();
      setChannels(data.channels || []);
    } catch {
      // ignore
    } finally {
      setLoadingChannels(false);
    }
  }, []);

  useEffect(() => {
    loadChannels();
  }, [loadChannels]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const handleIngest = async () => {
    if (!channelUrl.trim() || isIngesting) return;

    setIsIngesting(true);
    setLogs([]);
    setProgress(null);

    const runBatch = async (startIndex: number): Promise<void> => {
      const res = await fetch("/api/youtube/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelUrl: channelUrl.trim(), startIndex, batchSize: 10 }),
      });

      if (!res.body) throw new Error("스트림 없음");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let nextIndex: number | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event: SSEEvent = JSON.parse(line.slice(6));

            if (event.type !== "batch-done") {
              setLogs((prev) => [...prev, { text: event.message, type: event.type }]);
            }

            if ((event.type === "progress" || event.type === "batch-done") &&
                event.current !== undefined && event.total !== undefined) {
              setProgress({ current: event.current ?? (event.nextIndex ?? 0), total: event.total });
            }

            if (event.type === "batch-done" && event.nextIndex !== undefined) {
              nextIndex = event.nextIndex;
            }

            if (event.type === "done") {
              setProgress(null);
              await loadChannels();
              setChannelUrl("");
            }
          } catch {
            // parse error skip
          }
        }
      }

      // 다음 배치 자동 실행
      if (nextIndex !== null) {
        await runBatch(nextIndex);
      }
    };

    try {
      await runBatch(0);
    } catch (err) {
      setLogs((prev) => [
        ...prev,
        { text: `오류: ${err instanceof Error ? err.message : "알 수 없는 오류"}`, type: "error" },
      ]);
    } finally {
      setIsIngesting(false);
    }
  };

  const handleDelete = async (channelId: string, channelName: string) => {
    if (!confirm(`"${channelName}" 채널의 모든 학습 데이터를 삭제할까요?`)) return;
    await fetch(`/api/youtube/channels?channelId=${channelId}`, { method: "DELETE" });
    await loadChannels();
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto p-6 space-y-6 font-mono">
      <div>
        <h2 className="text-green-400 text-sm tracking-widest mb-1">📺 유튜브 채널 학습</h2>
        <p className="text-zinc-500 text-xs">채널 영상의 자막을 수집·벡터화해서 채팅 AI가 참고할 수 있게 해줘.</p>
      </div>

      {/* 채널 URL 입력 */}
      <div className="border border-zinc-800 p-4 space-y-3">
        <label className="text-xs text-zinc-400">채널 URL 또는 핸들</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={channelUrl}
            onChange={(e) => setChannelUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleIngest()}
            placeholder="https://youtube.com/@channelname"
            disabled={isIngesting}
            className="flex-1 bg-transparent border border-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-green-700 disabled:opacity-50"
          />
          <button
            onClick={handleIngest}
            disabled={isIngesting || !channelUrl.trim()}
            className="px-4 py-2 text-xs border border-green-800 text-green-400 bg-green-950 hover:bg-green-900 disabled:bg-zinc-900 disabled:text-zinc-600 disabled:border-zinc-800 transition-colors"
          >
            {isIngesting ? "학습 중..." : "학습 시작"}
          </button>
        </div>
        <p className="text-zinc-600 text-xs">예: @채널핸들 / https://youtube.com/@handle / https://youtube.com/channel/UCxxxxxx</p>
      </div>

      {/* 진행 상황 */}
      {(isIngesting || logs.length > 0) && (
        <div className="border border-zinc-800 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-400">진행 상황</span>
            {progress && (
              <span className="text-xs text-green-400">
                {progress.current} / {progress.total}
              </span>
            )}
          </div>

          {progress && (
            <div className="w-full bg-zinc-800 h-1">
              <div
                className="bg-green-600 h-1 transition-all"
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              />
            </div>
          )}

          <div className="max-h-48 overflow-y-auto space-y-1">
            {logs.map((log, i) => (
              <p
                key={i}
                className={`text-xs ${
                  log.type === "error"
                    ? "text-red-400"
                    : log.type === "done"
                    ? "text-green-400"
                    : log.text.startsWith("[완료]")
                    ? "text-green-600"
                    : log.text.startsWith("[스킵]") || log.text.startsWith("[자막없음]")
                    ? "text-zinc-600"
                    : "text-zinc-400"
                }`}
              >
                {log.text}
              </p>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>
      )}

      {/* 등록된 채널 목록 */}
      <div className="space-y-2">
        <h3 className="text-xs text-zinc-400 tracking-widest">등록된 채널</h3>

        {loadingChannels ? (
          <p className="text-xs text-zinc-600 animate-pulse">불러오는 중...</p>
        ) : channels.length === 0 ? (
          <p className="text-xs text-zinc-600">아직 등록된 채널이 없어.</p>
        ) : (
          <div className="space-y-2">
            {channels.map((ch) => (
              <div
                key={ch.id}
                className="border border-zinc-800 px-4 py-3 flex items-center justify-between hover:border-zinc-700 transition-colors"
              >
                <div className="space-y-0.5">
                  <p className="text-sm text-zinc-100">{ch.channel_name}</p>
                  <p className="text-xs text-zinc-500">
                    {ch.channel_url} · 영상 {ch.video_count}개 학습됨 ·{" "}
                    {new Date(ch.created_at).toLocaleDateString("ko-KR")}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(ch.channel_id, ch.channel_name)}
                  className="text-xs text-zinc-600 hover:text-red-400 transition-colors px-2 py-1 border border-transparent hover:border-red-900"
                >
                  삭제
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
