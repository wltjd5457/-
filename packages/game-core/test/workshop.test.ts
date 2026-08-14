import { describe, expect, it } from "vitest";
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
  toCompletedRun,
} from "../src";

describe("workshop reference missions", () => {
  it("omits transaction scanner and idempotency state in both modes", () => {
    const baseline = createGame();
    const demo = createGame({ workshopMode: "demo" });
    for (const game of [baseline, demo]) {
      const enemy = spawnEnemy(game, "overdraft-boss");
      expect("scannerEnabled" in game.workshop).toBe(false);
      expect("shieldEnabled" in game.workshop).toBe(false);
      expect("transaction" in enemy).toBe(false);
      expect("duplicate" in enemy).toBe(false);
    }
  });

  it("releases a charged consistency hotfix without affecting distant traffic", () => {
    const demo = createGame({ workshopMode: "demo" });
    startGame(demo);
    demo.workshop.ultimateCharge = 100;
    demo.vault.health = 50;
    spawnEnemy(demo, "fee-sprite", {
      x: demo.player.x + 200,
      y: demo.player.y,
    });
    const distant = spawnEnemy(demo, "fee-sprite", { x: 30, y: 30 });

    expect(activateCashbackUltimate(demo)).toBe(1);
    expect(demo.enemies.map((enemy) => enemy.id)).toContain(distant.id);
    expect(demo.vault.health).toBe(50);
    expect(demo.workshop.ultimateCharge).toBe(0);
    expect(demo.announcement).toBe("정합성 핫픽스! 장애 1건 정리");
  });

  it("activates tearful receipt throwing at the score threshold", () => {
    const demo = createGame({ workshopMode: "demo" });
    demo.spawnCooldownMs = 20_000;
    startGame(demo);
    demo.score = TEARFUL_RECEIPT_SCORE - 1;
    expect(activateTearfulReceiptUpgrade(demo)).toBe(false);

    demo.score = TEARFUL_RECEIPT_SCORE;
    expect(activateTearfulReceiptUpgrade(demo)).toBe(true);
    expect(demo.player.weaponLevel).toBe(2);
    expect(demo.announcement).toContain("눈물젖은 전표 날리기");

    spawnEnemy(demo, "fee-sprite", {
      x: demo.player.x + 200,
      y: demo.player.y,
    });
    demo.player.attackCooldownMs = 0;
    stepGame(demo, EMPTY_INPUT, 20);

    expect(demo.projectiles).toHaveLength(3);
    expect(demo.projectiles.filter((projectile) => projectile.tearful)).toHaveLength(2);
    expect(demo.projectiles.filter((projectile) => !projectile.tearful)).toHaveLength(1);
  });

  it("opens the dawn inspection stage and then the endless record stage", () => {
    const demo = createGame({
      workshopMode: "demo",
      roundDurationMs: 2_000,
      bossAtMs: 1_800,
    });
    demo.spawnCooldownMs = 20_000;
    startGame(demo);
    const firstBoss = spawnEnemy(demo, "overdraft-boss", {
      x: demo.player.x + 40,
      y: demo.player.y,
    });
    firstBoss.health = 1;

    for (let elapsed = 0; elapsed < 400; elapsed += 20) {
      stepGame(demo, EMPTY_INPUT, 20);
    }

    expect(demo.stage).toBe(2);
    expect(demo.phase).toBe("playing");
    expect(demo.elapsedMs).toBeLessThan(400);
    expect(demo.announcement).toBe("1단계 완료! 2단계 새벽 점검실 시작!");

    const stageTwoEnemy = spawnEnemy(demo, "fee-sprite");
    expect(stageTwoEnemy.speed).toBeGreaterThan(59);
    expect(stageTwoEnemy.maxHealth).toBeGreaterThan(4);
    expect(stageTwoEnemy.damage).toBeGreaterThan(3);
    const stageTwoBoss = spawnEnemy(demo, "overdraft-boss");
    expect(stageTwoBoss.maxHealth).toBe(
      Math.ceil(60 * 1.3 * 1.15 * 1.4),
    );

    demo.enemies = [stageTwoBoss];
    stageTwoBoss.x = demo.player.x + 40;
    stageTwoBoss.y = demo.player.y;
    const secondBoss = stageTwoBoss;
    secondBoss.health = 1;
    for (let elapsed = 0; elapsed < 800 && demo.stage === 2; elapsed += 20) {
      stepGame(demo, EMPTY_INPUT, 20);
    }

    expect(demo.stage).toBe(3);
    expect(demo.phase).toBe("playing");
    expect(demo.bossDefeated).toBe(false);
    expect(toCompletedRun(demo)).toBeNull();
  });

  it("raises endless difficulty and weapon power every 20 seconds", () => {
    const demo = createGame({ workshopMode: "demo" });
    startGame(demo);
    demo.stage = 3;
    demo.elapsedMs = ENDLESS_TIER_MS - 20;
    demo.spawnCooldownMs = 20_000;
    const enemy = spawnEnemy(demo, "fee-sprite", {
      x: demo.player.x + 200,
      y: demo.player.y,
    });
    const healthBefore = enemy.maxHealth;
    const speedBefore = enemy.speed;
    const scoreBefore = enemy.scoreValue;
    demo.player.attackCooldownMs = 0;

    stepGame(demo, EMPTY_INPUT, 20);

    expect(getEndlessLevel(demo)).toBe(2);
    expect(enemy.maxHealth).toBeGreaterThan(healthBefore);
    expect(enemy.speed).toBeGreaterThan(speedBefore);
    expect(enemy.scoreValue).toBe(Math.round(scoreBefore * 1.1));
    expect(demo.projectiles[0]?.damage).toBeCloseTo(6 * 0.85 * 1.05);
    expect(demo.player.attackCooldownMs).toBeLessThan(700);
  });

  it("applies the configured health and speed increases by stage", () => {
    const demo = createGame({ workshopMode: "demo" });
    const stageOneEnemy = spawnEnemy(demo, "fee-sprite");
    expect(stageOneEnemy.maxHealth).toBe(Math.ceil(4 * 1.15));
    expect(stageOneEnemy.speed).toBeCloseTo(68 * 1.15 * 1.3);

    demo.stage = 2;
    const stageTwoEnemy = spawnEnemy(demo, "fee-sprite");
    expect(stageTwoEnemy.maxHealth).toBe(Math.ceil(4 * 1.3 * 1.15));
    expect(stageTwoEnemy.speed).toBeCloseTo(68 * 1.15 * 1.3 * 1.2 * 1.1);

    const stageTwoBoss = spawnEnemy(demo, "overdraft-boss");
    expect(stageTwoBoss.maxHealth).toBe(Math.ceil(60 * 1.3 * 1.15 * 1.4));
  });
});
