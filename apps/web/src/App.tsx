import { useCallback, useEffect, useState } from "react";
import type { CompletedRun, WorkshopMode } from "@mochi-pay/game-core";
import {
  fetchGameConfig,
  submitResult,
  type GameConfigResponse,
} from "./api";
import { GameCanvas } from "./GameCanvas";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; config: GameConfigResponse };

export function App() {
  const workshopMode = getWorkshopMode();
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [configAttempt, setConfigAttempt] = useState(0);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [resultError, setResultError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoadState({ status: "loading" });
    fetchGameConfig(workshopMode, controller.signal)
      .then((config) => setLoadState({ status: "ready", config }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setLoadState({
          status: "error",
          message: error instanceof Error ? error.message : "게임 설정을 불러오지 못했습니다.",
        });
      });
    return () => controller.abort();
  }, [configAttempt, workshopMode]);

  const handleComplete = useCallback((run: CompletedRun) => {
    setReceipt(null);
    setResultError(null);
    submitResult(run)
      .then((result) => setReceipt(result.receiptId))
      .catch((error: unknown) =>
        setResultError(
          error instanceof Error ? error.message : "이번 게임 결과를 저장하지 못했습니다.",
        ),
      );
  }, []);

  return (
    <div className="app-shell">
      <header className="site-header">
        <div>
          <p className="eyebrow">야간배치 절.대.지.켜</p>
          <h1>원장 사수 가디언즈</h1>
        </div>
        <div className="header-actions">
          <nav className="mode-switcher" aria-label="워크숍 실행 모드">
            <a href="/" aria-current={workshopMode === "baseline" ? "page" : undefined}>
              내 게임
            </a>
            <a
              href="/?mode=demo"
              aria-current={workshopMode === "demo" ? "page" : undefined}
            >
              완성 데모
            </a>
          </nav>
          <div className="status-chip" aria-label="API 연결 상태">
            <span className="status-dot" aria-hidden="true" />
            {loadState.status === "ready" ? "원장 서버 연결됨" : "연결 중…"}
          </div>
        </div>
      </header>

      {loadState.status === "loading" && (
        <main className="loading-card" aria-live="polite">
          <div className="loading-mochi" aria-hidden="true">
            •ᴗ•
          </div>
          <p>원장 서버에 접속하는 중…</p>
        </main>
      )}

      {loadState.status === "error" && (
        <main className="error-card" role="alert">
          <p className="eyebrow">연결 오류</p>
          <h2>원장 서버 API가 응답하지 않습니다.</h2>
          <p>{loadState.message}</p>
          <button type="button" onClick={() => setConfigAttempt((value) => value + 1)}>
            다시 연결
          </button>
        </main>
      )}

      {loadState.status === "ready" && (
        <main>
          <GameCanvas config={loadState.config} onComplete={handleComplete} />
          <div className="run-message" aria-live="polite">
            {receipt && <>게임 기록 저장 완료: <strong>{receipt}</strong></>}
            {resultError && <span className="result-error">{resultError}</span>}
          </div>
        </main>
      )}

    </div>
  );
}

function getWorkshopMode(): WorkshopMode {
  return new URLSearchParams(window.location.search).get("mode") === "demo"
    ? "demo"
    : "baseline";
}
