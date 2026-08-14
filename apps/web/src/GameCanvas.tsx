import {
  activateCashbackUltimate,
  activateTearfulReceiptUpgrade,
  createGame,
  ENDLESS_TIER_MS,
  EMPTY_INPUT,
  getEndlessLevel,
  startGame,
  stepGame,
  TEARFUL_RECEIPT_SCORE,
  toCompletedRun,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type CompletedRun,
  type Enemy,
  type GameState,
  type InputState,
} from "@mochi-pay/game-core";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import type { GameConfigResponse } from "./api";
import { createArcadeAudio } from "./arcadeAudio";
import ledgerServerLogoUrl from "./assets/ledger-server-logo.png";

interface GameCanvasProps {
  config: GameConfigResponse;
  onComplete: (run: CompletedRun) => void;
}

const KEY_TO_INPUT: Partial<Record<string, keyof InputState>> = {
  ArrowUp: "up",
  w: "up",
  ArrowDown: "down",
  s: "down",
  ArrowLeft: "left",
  a: "left",
  ArrowRight: "right",
  d: "right",
};
const ENDLESS_RECORD_KEY = "ledger-guardians-endless-record";
const USE_LEDGER_SERVER_LOGO = true;
const ledgerServerLogo = new Image();
ledgerServerLogo.src = ledgerServerLogoUrl;

export function GameCanvas({ config, onComplete }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef(createConfiguredGame(config));
  const inputRef = useRef<InputState>({ ...EMPTY_INPUT });
  const lastFrameRef = useRef<number | null>(null);
  const lastSnapshotRef = useRef(0);
  const reportedRef = useRef(false);
  const fxRef = useRef<FxState>(createFxState());
  const audioRef = useRef<ReturnType<typeof createArcadeAudio>>(null);
  const soundMutedRef = useRef(false);
  const [view, setView] = useState(() => snapshot(gameRef.current));
  const [paused, setPaused] = useState(false);
  const [soundMuted, setSoundMuted] = useState(false);
  const [bestEndlessScore, setBestEndlessScore] = useState(readEndlessRecord);
  const reducedMotion = useReducedMotion();
  const missionPanelVisible =
    config.missions.consistencyHotfix ||
    config.missions.receiptWeaponUpgrade ||
    config.missions.dawnInspectionStage ||
    config.missions.endlessRecordStage;

  const restart = useCallback(() => {
    gameRef.current = createConfiguredGame(config);
    inputRef.current = { ...EMPTY_INPUT };
    reportedRef.current = false;
    lastFrameRef.current = null;
    fxRef.current = createFxState();
    audioRef.current?.setMusicRunning(false);
    setPaused(false);
    setView(snapshot(gameRef.current));
  }, [config]);

  const begin = useCallback(() => {
    startGame(gameRef.current);
    if (config.missions.soundRoom && !soundMutedRef.current) {
      audioRef.current ??= createArcadeAudio();
      audioRef.current?.setMusicRunning(true);
    }
    lastFrameRef.current = null;
    setView(snapshot(gameRef.current));
  }, [config.missions.soundRoom]);

  const toggleSound = useCallback(() => {
    const muted = !soundMutedRef.current;
    soundMutedRef.current = muted;
    setSoundMuted(muted);
    if (!audioRef.current && !muted && gameRef.current.phase === "playing") {
      audioRef.current = createArcadeAudio();
      audioRef.current?.setMusicRunning(!paused);
    }
    audioRef.current?.setMuted(muted);
  }, [paused]);

  const upgradeWeapon = useCallback(() => {
    activateTearfulReceiptUpgrade(gameRef.current);
    setView(snapshot(gameRef.current));
  }, []);

  useEffect(() => {
    const frame = (time: number) => {
      const game = gameRef.current;
      const canvas = canvasRef.current;
      if (lastFrameRef.current === null) {
        lastFrameRef.current = time;
      }
      const deltaMs = time - lastFrameRef.current;
      lastFrameRef.current = time;

      if (!paused) {
        stepGame(game, inputRef.current, deltaMs);
      }
      audioRef.current?.setMusicRunning(!paused && game.phase === "playing");
      trackEffects(
        fxRef.current,
        game,
        deltaMs,
        paused,
        reducedMotion,
        audioRef.current,
      );
      if (canvas) {
        renderGame(canvas, game, reducedMotion, fxRef.current);
      }

      if (time - lastSnapshotRef.current >= 100 || game.phase !== view.phase) {
        lastSnapshotRef.current = time;
        setView(snapshot(game));
      }
      if (!reportedRef.current) {
        const run = toCompletedRun(game);
        if (run) {
          reportedRef.current = true;
          if (game.stage === 3) {
            setBestEndlessScore((current) => {
              const next = Math.max(current, game.score);
              if (next !== current) {
                writeEndlessRecord(next);
              }
              return next;
            });
          }
          onComplete(run);
        }
      }

      animationFrameId = requestAnimationFrame(frame);
    };

    let animationFrameId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animationFrameId);
  }, [onComplete, paused, reducedMotion, view.phase]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const inputKey = KEY_TO_INPUT[event.key] ?? KEY_TO_INPUT[event.key.toLowerCase()];
      if (inputKey) {
        inputRef.current[inputKey] = true;
        event.preventDefault();
      }
      if (event.code === "Space" && !event.repeat) {
        event.preventDefault();
        if (gameRef.current.phase === "ready") {
          begin();
        } else if (gameRef.current.phase === "won" || gameRef.current.phase === "lost") {
          restart();
        }
      }
      if (event.key.toLowerCase() === "p" && !event.repeat) {
        setPaused((value) => !value);
      }
      if (config.missions.soundRoom && event.key.toLowerCase() === "m" && !event.repeat) {
        toggleSound();
      }
      if (!paused && event.key.toLowerCase() === "q" && !event.repeat) {
        activateCashbackUltimate(gameRef.current);
        setView(snapshot(gameRef.current));
      }
      if (!paused && event.key.toLowerCase() === "r" && !event.repeat) {
        upgradeWeapon();
      }
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      const inputKey = KEY_TO_INPUT[event.key] ?? KEY_TO_INPUT[event.key.toLowerCase()];
      if (inputKey) {
        inputRef.current[inputKey] = false;
      }
    };
    const releaseKeys = () => {
      inputRef.current = { ...EMPTY_INPUT };
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", releaseKeys);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", releaseKeys);
    };
  }, [begin, config.missions.soundRoom, paused, restart, toggleSound, upgradeWeapon]);

  useEffect(
    () => () => {
      audioRef.current?.dispose();
    },
    [],
  );

  const remainingSeconds = Math.max(
    0,
    Math.ceil((view.roundDurationMs - view.elapsedMs) / 1_000),
  );
  const endlessLevel = getEndlessLevel(view);
  const timeText =
    view.stage === 3
      ? formatElapsedTime(view.elapsedMs)
      : `${remainingSeconds}초`;
  const boss = view.enemies.find((enemy) => enemy.kind === "overdraft-boss");
  const progress =
    view.stage === 3
      ? ((view.elapsedMs % ENDLESS_TIER_MS) / ENDLESS_TIER_MS) * 100
      : (view.elapsedMs / view.roundDurationMs) * 100;
  const isComplete = view.phase === "won" || view.phase === "lost";
  const moving = view.phase === "playing" && !paused && view.player.moving;
  const liveMessage = isComplete
    ? view.outcomeReason ?? ""
    : view.phase === "playing" && view.elapsedMs < view.announcementUntilMs
      ? view.announcement
      : "";

  return (
    <section className="game-card" aria-label="원장 사수 가디언즈 게임">
      <p className="sr-only" aria-live="polite">
        {liveMessage}
      </p>
      <div className="hud">
        <Meter
          label="차대 정합성"
          value={view.vault.health}
          maximum={view.vault.maxHealth}
          icon="◆"
          tone="gold"
        />
        <div className="hud-stat">
          <span>{view.stage === 3 ? `WAVE ${endlessLevel}` : "TIME"}</span>
          <strong>{timeText}</strong>
        </div>
        <div className="hud-stat">
          <span>
            SCORE{view.stage === 3 ? ` · BEST ${bestEndlessScore.toLocaleString()}` : ""}
          </span>
          <strong>{view.score.toLocaleString()}</strong>
        </div>
        <div className="hud-stat">
          <span>토대리 체력</span>
          <strong className="hearts" aria-label={`토대리 체력 ${view.player.health}`}>
            {"♥".repeat(view.player.health)}
            <span className="empty-hearts">
              {"♡".repeat(view.player.maxHealth - view.player.health)}
            </span>
          </strong>
        </div>
      </div>

      <div className="game-stage">
        {config.missions.soundRoom && (
          <button
            type="button"
            className="sound-toggle"
            onClick={toggleSound}
            aria-pressed={!soundMuted}
            aria-label={`배경 음악과 효과음 ${soundMuted ? "켜기" : "끄기"}`}
          >
            {soundMuted ? "♪ 소리 끔" : "♫ 소리 켬"} <kbd>M</kbd>
          </button>
        )}
        <canvas
          ref={canvasRef}
          width={WORLD_WIDTH}
          height={WORLD_HEIGHT}
          tabIndex={0}
          role="img"
          aria-label={`탑다운 야간 배치 사수전. ${view.stage === 3 ? `무한 점검 WAVE ${endlessLevel}, 기록 ${timeText}` : `남은 시간 ${remainingSeconds}초`}, 차대 정합성 ${Math.round(view.vault.health)}, 토대리 체력 ${view.player.health}, 점수 ${view.score}.`}
          onKeyDown={(event: ReactKeyboardEvent) => {
            if (event.code === "Space") {
              event.preventDefault();
            }
          }}
        />

        {(view.phase === "ready" || isComplete || paused) && (
          <div className="game-overlay">
            <div className={`overlay-mochi ${isComplete ? view.phase : ""}`} aria-hidden="true">
              {view.phase === "lost" ? "×﹏×" : "•ᴗ•"}
            </div>
            {view.phase === "ready" && (
              <>
                <p className="eyebrow">점검 종료까지 100초</p>
                <h2>원장 서버를 사수하라!</h2>
                <p>
                  토대리를 움직여 전표 날리기로 장애를 요격하세요. <br></br>
                  시간이 끝나기 전에 최종 마감 배치를 완료해야 합니다.
                </p>
                <button type="button" onClick={begin}>
                  근무 시작 <kbd>스페이스</kbd>
                </button>
              </>
            )}
            {paused && !isComplete && view.phase !== "ready" && (
              <>
                <p className="eyebrow">잠시 멈춤</p>
                <h2>따뜻한 차 한 모금!</h2>
                <button type="button" onClick={() => setPaused(false)}>
                  계속하기 <kbd>P</kbd>
                </button>
              </>
            )}
            {isComplete && (
              <>
                <p className="eyebrow">
                  {view.stage === 3
                    ? "무한 점검 기록 종료"
                    : view.phase === "won"
                      ? "원장 사수 성공"
                      : "마감 실패"}
                </p>
                <h2>
                  {view.stage === 3
                    ? `${formatElapsedTime(view.elapsedMs)} 생존 · 최고 ${Math.max(bestEndlessScore, view.score).toLocaleString()}점`
                    : view.phase === "won"
                      ? "차변과 대변이 맞았습니다!"
                      : "원장 불일치가 발생했습니다."}
                </h2>
                <p>{view.outcomeReason}</p>
                <p className="final-score">
                  {view.score.toLocaleString()}점 · 위협 {view.defeatedCount}마리 제거
                </p>
                <button type="button" onClick={restart}>
                  다시 시작 <kbd>스페이스</kbd>
                </button>
              </>
            )}
          </div>
        )}

        <div className="round-progress" aria-hidden="true">
          <span style={{ width: `${progress}%` }} />
        </div>
      </div>

      {boss && (
        <div className="boss-meter" aria-label={`${view.stage === 2 ? "새벽 재점검" : "최종 마감 배치"} 보스 체력 ${boss.maxHealth} 중 ${Math.ceil(boss.health)}`}>
          <span>
            {view.stage === 2
              ? "새벽 재점검 // 갑자기 튀어나온 더 큰 숫자"
              : "최종 마감 배치 // 갑자기 튀어나온 초면인 숫자"}
          </span>
          <div>
            <i style={{ width: `${Math.max(0, (boss.health / boss.maxHealth) * 100)}%` }} />
          </div>
        </div>
      )}

      {missionPanelVisible && (
        <div className="mission-panel" aria-label="핸즈온 미션 상태">
          {config.missions.consistencyHotfix && (
            <span>
              <b>01</b> 정합성 핫픽스 <kbd>Q</kbd>{" "}
              {Math.round(view.workshop.ultimateCharge)}%
            </span>
          )}
          {config.missions.receiptWeaponUpgrade && (
            <span className="weapon-upgrade">
              <b>02</b>{" "}
              {view.player.weaponLevel === 2 ? (
                "눈물젖은 전표 날리기 활성화"
              ) : (
                <button
                  type="button"
                  onClick={upgradeWeapon}
                  disabled={view.score < TEARFUL_RECEIPT_SCORE || view.phase !== "playing"}
                >
                  눈물젖은 전표 날리기 <kbd>R</kbd>{" "}
                  {Math.min(view.score, TEARFUL_RECEIPT_SCORE).toLocaleString()}/
                  {TEARFUL_RECEIPT_SCORE.toLocaleString()}
                </button>
              )}
            </span>
          )}
          {config.missions.dawnInspectionStage && (
            <span>
              <b>03</b> 새벽 점검실{" "}
              {view.stage === 1
                ? "1단계 보스 대기"
                : view.stage === 2
                  ? "진행 중"
                  : "완료"}
            </span>
          )}
          {config.missions.endlessRecordStage && (
            <span>
              <b>04</b>{" "}
              {view.stage === 3
                ? `무한 점검 WAVE ${endlessLevel} · 최고 ${bestEndlessScore.toLocaleString()}점`
                : "??? 히든 스테이지"}
            </span>
          )}
        </div>
      )}

      <div className="control-strip">
        <div>
          <span className="control-title">이동</span>
          <kbd>WASD</kbd> 또는 <kbd>방향키</kbd>
        </div>
        <div>
          <span className="control-title">공격</span>
          {view.player.weaponLevel === 2 ? "눈물젖은 전표 날리기" : "전표 날리기"}
          {view.stage === 3 && ` · 강화 단계 ${endlessLevel}`}
          {moving ? " · 이동 중: 연사 강화" : " · 정지 중: 이동하면 연사 강화"}
        </div>
        <div>
          <span className="control-title">일시정지</span>
          <kbd>P</kbd>
        </div>
        <div className="enemy-key" aria-label="적 모양 안내">
          <span>● 수수료 오차</span>
          <span>⬢ 중복 전표</span>
          <span>▰ 역분개 오류</span>
        </div>
      </div>
    </section>
  );
}

function Meter({
  label,
  value,
  maximum,
  icon,
  tone,
}: {
  label: string;
  value: number;
  maximum: number;
  icon: string;
  tone: "mint" | "gold";
}) {
  const percentage = Math.max(0, (value / maximum) * 100);
  return (
    <div className="meter">
      <div className="meter-label">
        <span>{icon} {label}</span>
        <strong>{Math.ceil(value)}/{maximum}</strong>
      </div>
      <div
        className={`meter-track ${tone}`}
        role="meter"
        aria-label={label}
        aria-valuenow={Math.ceil(value)}
        aria-valuemin={0}
        aria-valuemax={maximum}
      >
        <i style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

function createConfiguredGame(config: GameConfigResponse): GameState {
  return createGame({
    seed: config.dailySeed,
    roundDurationMs: config.roundDurationSeconds * 1_000,
    bossAtMs: config.bossAtSeconds * 1_000,
    workshopMode: config.workshopMode,
  });
}

function snapshot(state: GameState): GameState {
  return structuredClone(state);
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

function renderGame(
  canvas: HTMLCanvasElement,
  state: GameState,
  reducedMotion: boolean,
  fx: FxState,
): void {
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  context.imageSmoothingEnabled = false;

  // Base fill first so screen-shake translation never reveals blank edges.
  context.fillStyle = "#17132a";
  context.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

  const shakeX = reducedMotion ? 0 : Math.round((Math.random() - 0.5) * 2 * fx.shakeMag);
  const shakeY = reducedMotion ? 0 : Math.round((Math.random() - 0.5) * 2 * fx.shakeMag);
  context.save();
  context.translate(shakeX, shakeY);

  drawFloor(context, state.stage);
  drawVault(context, state, fx);
  drawParticles(context, fx);
  drawWorkshopEffects(context, state, reducedMotion);

  for (const projectile of state.projectiles) {
    drawProjectile(context, projectile.x, projectile.y, projectile.tearful);
  }
  for (const enemy of state.enemies) {
    drawEnemy(
      context,
      enemy,
      state.elapsedMs,
      reducedMotion,
      fx.flash.get(enemy.id) ?? 0,
    );
  }
  drawMochi(context, state, reducedMotion, fx);
  drawFloatingText(context, fx);
  context.restore();

  drawAnnouncement(context, state);
}

function drawFloor(context: CanvasRenderingContext2D, stage: GameState["stage"]): void {
  const colors: readonly [string, string, string, string, string] =
    stage === 3
      ? ["#1d1026", "#2b1533", "#31183a", "#5b295a", "#7e376c"]
      : stage === 2
        ? ["#101d2d", "#162a3d", "#192f43", "#23475b", "#2e6372"]
        : ["#17132a", "#1d1932", "#201b38", "#2a2344", "#302850"];
  context.fillStyle = colors[0];
  context.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  const tile = 48;
  for (let y = 0; y < WORLD_HEIGHT; y += tile) {
    for (let x = 0; x < WORLD_WIDTH; x += tile) {
      context.fillStyle =
        (x / tile + y / tile) % 2 === 0 ? colors[1] : colors[2];
      context.fillRect(x, y, tile, tile);
      context.fillStyle = colors[3];
      context.fillRect(x + 7, y + 7, 3, 3);
    }
  }

  context.strokeStyle = colors[4];
  context.lineWidth = 3;
  context.setLineDash([6, 10]);
  context.beginPath();
  context.arc(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, 190, 0, Math.PI * 2);
  context.stroke();
  context.setLineDash([]);
}

function formatElapsedTime(elapsedMs: number): string {
  const totalSeconds = Math.floor(elapsedMs / 1_000);
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

function readEndlessRecord(): number {
  try {
    const score = Number.parseInt(localStorage.getItem(ENDLESS_RECORD_KEY) ?? "0", 10);
    return Number.isFinite(score) && score > 0 ? score : 0;
  } catch (error) {
    console.warn("무한 점검 최고 기록을 읽지 못했습니다.", error);
    return 0;
  }
}

function writeEndlessRecord(score: number): void {
  try {
    localStorage.setItem(ENDLESS_RECORD_KEY, String(score));
  } catch (error) {
    console.warn("무한 점검 최고 기록을 저장하지 못했습니다.", error);
  }
}

function drawVault(context: CanvasRenderingContext2D, state: GameState, fx: FxState): void {
  const { x, y } = state.vault;
  if (
    USE_LEDGER_SERVER_LOGO &&
    ledgerServerLogo.complete &&
    ledgerServerLogo.naturalWidth > 0
  ) {
    context.drawImage(ledgerServerLogo, x - 56, y - 56, 112, 112);
  } else {
    drawOriginalVault(context, state);
  }

  if (fx.vaultFlashMs > 0) {
    context.globalAlpha = Math.min(0.6, fx.vaultFlashMs / 300);
    context.fillStyle = "#ff5d6c";
    context.fillRect(x - 57, y - 57, 114, 114);
    context.globalAlpha = 1;
  }
}

function drawOriginalVault(context: CanvasRenderingContext2D, state: GameState): void {
  const { x, y, health } = state.vault;
  context.fillStyle = "#0e0b1b";
  context.fillRect(x - 57, y - 49, 114, 98);
  context.fillStyle = health > 35 ? "#74e0b5" : "#ff8f8f";
  context.fillRect(x - 51, y - 43, 102, 86);
  context.fillStyle = "#213d42";
  context.fillRect(x - 43, y - 35, 86, 70);
  context.fillStyle = "#9ef2cd";
  context.fillRect(x - 35, y - 27, 70, 54);
  context.fillStyle = "#213d42";
  context.fillRect(x - 23, y - 18, 46, 36);
  context.fillStyle = "#f9d976";
  context.fillRect(x - 7, y - 7, 14, 14);
  context.fillRect(x - 3, y - 16, 6, 32);
  context.fillRect(x - 16, y - 3, 32, 6);
}

function drawMochi(
  context: CanvasRenderingContext2D,
  state: GameState,
  reducedMotion: boolean,
  fx: FxState,
): void {
  const { player, elapsedMs } = state;
  const bob = reducedMotion ? 0 : Math.round(Math.sin(elapsedMs / 150) * 2);
  const x = Math.round(player.x);
  const y = Math.round(player.y + bob);
  const hurt = player.invulnerableMs > 0;
  // While invulnerable, flicker a red tint but keep Bun Mochi visible for readability.
  const dim = hurt && !reducedMotion && Math.floor(player.invulnerableMs / 120) % 2 === 0;

  context.fillStyle = "#0d0a18";
  context.fillRect(x - 19, y + 12, 38, 8);
  context.fillStyle = dim ? "#f78a95" : "#f5b4b8";
  context.fillRect(x - 14, y - 29, 9, 21);
  context.fillRect(x + 5, y - 29, 9, 21);
  context.fillStyle = dim ? "#ffd9d0" : "#fff3e8";
  context.fillRect(x - 18, y - 13, 36, 30);
  context.fillRect(x - 13, y - 18, 26, 38);
  context.fillStyle = "#3a2743";
  context.fillRect(x - 9, y - 3, 4, 5);
  context.fillRect(x + 5, y - 3, 4, 5);
  context.fillStyle = "#e66d83";
  context.fillRect(x - 2, y + 4, 4, 3);
  context.fillStyle = "#78e6c2";
  context.fillRect(x - 18, y + 12, 36, 6);

  if (fx.muzzleMs > 0) {
    context.globalAlpha = Math.min(1, fx.muzzleMs / 90);
    context.fillStyle = "#fff7cf";
    context.fillRect(x - 3, y - 26, 6, 6);
    context.globalAlpha = 1;
  }
  if (hurt) {
    context.globalAlpha = 0.35;
    context.fillStyle = "#ff5d6c";
    context.fillRect(x - 18, y - 18, 36, 38);
    context.globalAlpha = 1;
  }
}

function drawEnemy(
  context: CanvasRenderingContext2D,
  enemy: Enemy,
  elapsedMs: number,
  reducedMotion: boolean,
  flashMs: number,
): void {
  const bob = reducedMotion ? 0 : Math.round(Math.sin(elapsedMs / 180 + enemy.id) * 2);
  const x = Math.round(enemy.x);
  const y = Math.round(enemy.y + bob);
  context.fillStyle = "#0d0a18";
  context.fillRect(x - enemy.radius, y + enemy.radius - 3, enemy.radius * 2, 6);

  if (enemy.kind === "fee-sprite") {
    context.fillStyle = "#f49a67";
    context.fillRect(x - 13, y - 13, 26, 26);
    context.fillStyle = "#ffd080";
    context.fillRect(x - 8, y - 8, 16, 16);
    context.fillStyle = "#593044";
    context.fillRect(x - 5, y - 2, 3, 4);
    context.fillRect(x + 3, y - 2, 3, 4);
  } else if (enemy.kind === "duplicate-blob") {
    context.fillStyle = "#a28bff";
    context.fillRect(x - 16, y - 11, 32, 24);
    context.fillRect(x - 11, y - 16, 22, 32);
    context.strokeStyle = "#e0d8ff";
    context.lineWidth = 3;
    context.strokeRect(x - 7, y - 9, 14, 12);
    context.strokeRect(x - 2, y - 4, 14, 12);
  } else if (enemy.kind === "chargeback-crab") {
    context.fillStyle = "#ef6c76";
    context.fillRect(x - 19, y - 12, 38, 25);
    context.fillRect(x - 25, y - 8, 8, 13);
    context.fillRect(x + 17, y - 8, 8, 13);
    context.fillStyle = "#ffe3bb";
    context.fillRect(x - 9, y - 5, 5, 5);
    context.fillRect(x + 5, y - 5, 5, 5);
  } else {
    context.fillStyle = "#663f84";
    context.fillRect(x - 37, y - 33, 74, 67);
    context.fillStyle = "#925bb4";
    context.fillRect(x - 31, y - 39, 62, 73);
    context.fillStyle = "#f6c85f";
    context.fillRect(x - 29, y - 48, 58, 9);
    context.fillRect(x - 24, y - 57, 10, 10);
    context.fillRect(x - 5, y - 61, 10, 14);
    context.fillRect(x + 14, y - 57, 10, 10);
    context.fillStyle = "#fff2d4";
    context.fillRect(x - 18, y - 15, 12, 9);
    context.fillRect(x + 6, y - 15, 12, 9);
    context.fillStyle = "#2b1639";
    context.fillRect(x - 14, y - 12, 6, 6);
    context.fillRect(x + 8, y - 12, 6, 6);
  }

  if (enemy.health < enemy.maxHealth) {
    const width = enemy.kind === "overdraft-boss" ? 72 : enemy.radius * 2;
    context.fillStyle = "#0b0913";
    context.fillRect(x - width / 2, y - enemy.radius - 13, width, 5);
    context.fillStyle = "#ffdd7d";
    context.fillRect(
      x - width / 2,
      y - enemy.radius - 13,
      width * Math.max(0, enemy.health / enemy.maxHealth),
      5,
    );
  }

  if (flashMs > 0) {
    context.globalAlpha = Math.min(0.85, flashMs / 120);
    context.fillStyle = "#ffffff";
    context.fillRect(x - enemy.radius, y - enemy.radius, enemy.radius * 2, enemy.radius * 2);
    context.globalAlpha = 1;
  }

}

function drawWorkshopEffects(
  context: CanvasRenderingContext2D,
  state: GameState,
  reducedMotion: boolean,
): void {
  if (state.workshop.ultimatePulseMs > 0) {
    const progress = 1 - state.workshop.ultimatePulseMs / 900;
    const radius = reducedMotion ? 220 : 30 + progress * 330;
    context.fillStyle = "rgba(255, 216, 114, 0.14)";
    context.beginPath();
    context.arc(state.player.x, state.player.y, radius, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = "#fff3b5";
    context.lineWidth = 8;
    context.stroke();
  }
}

function drawProjectile(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  tearful: boolean,
): void {
  const roundedX = Math.round(x);
  const roundedY = Math.round(y);
  if (tearful) {
    context.fillStyle = "#7fdcff";
    context.fillRect(roundedX - 3, roundedY - 6, 6, 9);
    context.fillRect(roundedX - 1, roundedY - 9, 2, 3);
    context.fillStyle = "#d5f5ff";
    context.fillRect(roundedX - 2, roundedY - 5, 2, 3);
    return;
  }
  context.fillStyle = "#fff3aa";
  context.fillRect(roundedX - 3, roundedY - 8, 6, 16);
  context.fillRect(roundedX - 8, roundedY - 3, 16, 6);
  context.fillStyle = "#fffdf1";
  context.fillRect(roundedX - 2, roundedY - 2, 4, 4);
}

function drawAnnouncement(context: CanvasRenderingContext2D, state: GameState): void {
  if (
    state.phase === "ready" ||
    state.elapsedMs >= state.announcementUntilMs ||
    !state.announcement
  ) {
    return;
  }
  context.font = "bold 22px ui-monospace, monospace";
  context.textAlign = "center";
  const width = context.measureText(state.announcement).width + 38;
  context.fillStyle = "rgba(13, 10, 24, 0.9)";
  context.fillRect(WORLD_WIDTH / 2 - width / 2, 30, width, 44);
  context.fillStyle = "#fff1b8";
  context.fillText(state.announcement, WORLD_WIDTH / 2, 59);
}

// --- Renderer-only game feel ("juice"). Derived by diffing the live game each
// frame, so game-core stays deterministic and untested rendering carries no rules. ---

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  lifeMs: number;
  ttlMs: number;
  size: number;
  color: string;
}

interface FloatingText {
  x: number;
  y: number;
  text: string;
  lifeMs: number;
  ttlMs: number;
  vy: number;
  color: string;
}

interface EnemySnapshot {
  x: number;
  y: number;
  health: number;
  scoreValue: number;
  boss: boolean;
}

interface FxState {
  particles: Particle[];
  floats: FloatingText[];
  flash: Map<number, number>;
  prevEnemies: Map<number, EnemySnapshot>;
  prevVaultHealth: number;
  prevPlayerHealth: number;
  prevProjectiles: number;
  vaultFlashMs: number;
  muzzleMs: number;
  shakeMag: number;
}

function createFxState(): FxState {
  return {
    particles: [],
    floats: [],
    flash: new Map(),
    prevEnemies: new Map(),
    prevVaultHealth: Number.POSITIVE_INFINITY,
    prevPlayerHealth: Number.POSITIVE_INFINITY,
    prevProjectiles: 0,
    vaultFlashMs: 0,
    muzzleMs: 0,
    shakeMag: 0,
  };
}

function addShake(fx: FxState, magnitude: number): void {
  fx.shakeMag = Math.min(9, Math.max(fx.shakeMag, magnitude));
}

function trackEffects(
  fx: FxState,
  state: GameState,
  deltaMs: number,
  paused: boolean,
  reducedMotion: boolean,
  audio: ReturnType<typeof createArcadeAudio>,
): void {
  // Decay time-based effects regardless of pause so nothing freezes mid-flash.
  const decay = Math.min(deltaMs, 100);
  fx.vaultFlashMs = Math.max(0, fx.vaultFlashMs - decay);
  fx.muzzleMs = Math.max(0, fx.muzzleMs - decay);
  fx.shakeMag = Math.max(0, fx.shakeMag - decay * 0.03);
  for (const [id, ms] of fx.flash) {
    const next = ms - decay;
    if (next <= 0) {
      fx.flash.delete(id);
    } else {
      fx.flash.set(id, next);
    }
  }
  advanceParticles(fx.particles, decay);
  advanceFloats(fx.floats, decay);

  if (paused) {
    return;
  }

  const live = new Map<number, EnemySnapshot>();
  let defeated = false;
  let bossDefeated = false;
  for (const enemy of state.enemies) {
    const prev = fx.prevEnemies.get(enemy.id);
    if (prev && enemy.health < prev.health) {
      fx.flash.set(enemy.id, 120);
    }
    live.set(enemy.id, {
      x: enemy.x,
      y: enemy.y,
      health: enemy.health,
      scoreValue: enemy.scoreValue,
      boss: enemy.kind === "overdraft-boss",
    });
  }
  // An id present last frame but gone now was defeated: pop coins + score.
  for (const [id, prev] of fx.prevEnemies) {
    if (!live.has(id)) {
      spawnDefeatBurst(fx, prev.x, prev.y, prev.scoreValue, prev.boss, reducedMotion);
      defeated = true;
      bossDefeated ||= prev.boss;
    }
  }
  if (defeated) {
    audio?.playDefeat(bossDefeated);
  }
  fx.prevEnemies = live;

  if (
    Number.isFinite(fx.prevVaultHealth) &&
    state.vault.health < fx.prevVaultHealth
  ) {
    fx.vaultFlashMs = 300;
    addShake(fx, 4);
    audio?.playVaultHit();
  }
  fx.prevVaultHealth = state.vault.health;

  if (
    Number.isFinite(fx.prevPlayerHealth) &&
    state.player.health < fx.prevPlayerHealth
  ) {
    addShake(fx, 6);
    audio?.playPlayerHit();
  }
  fx.prevPlayerHealth = state.player.health;

  if (state.projectiles.length > fx.prevProjectiles) {
    fx.muzzleMs = 90;
    audio?.playShot();
  }
  fx.prevProjectiles = state.projectiles.length;
}

function spawnDefeatBurst(
  fx: FxState,
  x: number,
  y: number,
  scoreValue: number,
  boss: boolean,
  reducedMotion: boolean,
): void {
  if (!reducedMotion) {
    const count = boss ? 26 : 8;
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * (boss ? 220 : 130);
      fx.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 40,
        lifeMs: 0,
        ttlMs: boss ? 900 : 520,
        size: boss ? 5 : 3,
        color: i % 2 === 0 ? "#ffd872" : "#fff3c4",
      });
    }
    addShake(fx, boss ? 9 : 1.5);
  }
  fx.floats.push({
    x,
    y: y - 18,
    text: `+${scoreValue.toLocaleString()}`,
    lifeMs: 0,
    ttlMs: boss ? 1400 : 900,
    vy: reducedMotion ? 0 : -26,
    color: boss ? "#ffe18a" : "#ffd872",
  });
}

function advanceParticles(particles: Particle[], deltaMs: number): void {
  const dt = deltaMs / 1000;
  let write = 0;
  for (let read = 0; read < particles.length; read += 1) {
    const p = particles[read]!;
    p.lifeMs += deltaMs;
    if (p.lifeMs >= p.ttlMs) {
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 520 * dt; // gravity so coins arc and settle
    particles[write++] = p;
  }
  particles.length = write;
}

function advanceFloats(floats: FloatingText[], deltaMs: number): void {
  let write = 0;
  for (let read = 0; read < floats.length; read += 1) {
    const f = floats[read]!;
    f.lifeMs += deltaMs;
    if (f.lifeMs >= f.ttlMs) {
      continue;
    }
    f.y += (f.vy * deltaMs) / 1000;
    floats[write++] = f;
  }
  floats.length = write;
}

function drawParticles(context: CanvasRenderingContext2D, fx: FxState): void {
  for (const p of fx.particles) {
    context.globalAlpha = Math.max(0, 1 - p.lifeMs / p.ttlMs);
    context.fillStyle = p.color;
    const s = p.size;
    context.fillRect(Math.round(p.x) - s / 2, Math.round(p.y) - s / 2, s, s);
  }
  context.globalAlpha = 1;
}

function drawFloatingText(context: CanvasRenderingContext2D, fx: FxState): void {
  context.font = "bold 18px ui-monospace, monospace";
  context.textAlign = "center";
  for (const f of fx.floats) {
    context.globalAlpha = Math.max(0, 1 - f.lifeMs / f.ttlMs);
    context.fillStyle = "#2a1730";
    context.fillText(f.text, Math.round(f.x) + 1, Math.round(f.y) + 1);
    context.fillStyle = f.color;
    context.fillText(f.text, Math.round(f.x), Math.round(f.y));
  }
  context.globalAlpha = 1;
}
