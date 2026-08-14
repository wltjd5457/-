import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  activateCashbackUltimate,
  activateTearfulReceiptUpgrade,
  createGame,
  ENDLESS_TIER_MS,
  EMPTY_INPUT,
  getEndlessLevel,
  spawnEnemy,
  startGame,
  stepGame,
  TEARFUL_RECEIPT_SCORE,
} from "../src";
import type { WorkshopMode } from "../src";

const mode: WorkshopMode =
  process.env.WORKSHOP_MODE === "demo" ? "demo" : "baseline";
const baselineSource = readFileSync(
  new URL("../src/baselineMissions.ts", import.meta.url),
  "utf8",
);
const gameSource = readFileSync(new URL("../src/game.ts", import.meta.url), "utf8");
const apiSource = readFileSync(
  new URL("../../../apps/api/src/index.ts", import.meta.url),
  "utf8",
);
const webSource = readFileSync(
  new URL("../../../apps/web/src/GameCanvas.tsx", import.meta.url),
  "utf8",
);

it("미션 1 미션 2 미션 3 미션 4 경계: baseline은 demo 구현과 분리된다", () => {
  expect(baselineSource).not.toMatch(/demoMissions|DEMO_WORKSHOP_EXTENSION/);
  expect(baselineSource).not.toMatch(
    /workshopMode|workshop\.mode|["']demo["']/,
  );
  expect(gameSource).toMatch(/baseline:\s*BASELINE_WORKSHOP_EXTENSION/);
  expect(gameSource).toMatch(/demo:\s*DEMO_WORKSHOP_EXTENSION/);
  expect(apiSource).toMatch(
    /workshopMode === "demo" \? DEMO_MISSIONS : BASELINE_MISSIONS/,
  );
  expect(webSource).not.toMatch(
    /workshopMode\s*===\s*["']demo|workshop\.mode\s*===\s*["']demo/,
  );
});

describe("미션 1 도전 검사", () => {
  it("충전된 정합성 핫픽스를 발동한다", () => {
    const game = createGame({ workshopMode: mode });
    startGame(game);
    game.workshop.ultimateCharge = 100;
    spawnEnemy(game, "fee-sprite", {
      x: game.player.x + 20,
      y: game.player.y,
    });
    expect(activateCashbackUltimate(game)).toBe(1);
  });
});

describe("미션 2 도전 검사", () => {
  it("점수를 모아 눈물젖은 전표 날리기를 활성화한다", () => {
    const game = createGame({ workshopMode: mode });
    game.spawnCooldownMs = 20_000;
    startGame(game);
    game.score = TEARFUL_RECEIPT_SCORE;

    expect(activateTearfulReceiptUpgrade(game)).toBe(true);

    spawnEnemy(game, "fee-sprite", {
      x: game.player.x + 200,
      y: game.player.y,
    });
    game.player.attackCooldownMs = 0;
    stepGame(game, EMPTY_INPUT, 20);

    expect(game.projectiles).toHaveLength(3);
    expect(game.projectiles.filter((projectile) => projectile.tearful)).toHaveLength(2);
  });
});

describe("미션 3 도전 검사", () => {
  it("1단계 보스 처치 후 새벽 점검실을 연다", () => {
    const game = createGame({
      workshopMode: mode,
      roundDurationMs: 2_000,
      bossAtMs: 1_800,
    });
    game.spawnCooldownMs = 20_000;
    startGame(game);
    const firstBoss = spawnEnemy(game, "overdraft-boss", {
      x: game.player.x + 40,
      y: game.player.y,
    });
    firstBoss.health = 1;

    for (let elapsed = 0; elapsed < 400; elapsed += 20) {
      stepGame(game, EMPTY_INPUT, 20);
    }

    expect(game.stage).toBe(2);
    expect(game.phase).toBe("playing");
  });
});

describe("미션 4 도전 검사", () => {
  it("2단계 보스 뒤 무한 기록전을 열고 20초마다 강화한다", () => {
    const game = createGame({ workshopMode: mode });
    startGame(game);
    game.stage = 2;
    game.spawnCooldownMs = 20_000;
    const boss = spawnEnemy(game, "overdraft-boss", {
      x: game.player.x + 40,
      y: game.player.y,
    });
    boss.health = 1;

    for (let elapsed = 0; elapsed < 800 && game.stage === 2; elapsed += 20) {
      stepGame(game, EMPTY_INPUT, 20);
    }

    expect(game.stage).toBe(3);
    game.elapsedMs = ENDLESS_TIER_MS - 20;
    const enemy = spawnEnemy(game, "fee-sprite");
    const healthBefore = enemy.maxHealth;
    stepGame(game, EMPTY_INPUT, 20);

    expect(getEndlessLevel(game)).toBe(2);
    expect(enemy.maxHealth).toBeGreaterThan(healthBefore);
  });
});
