import { describe, expect, it } from "vitest";
import {
  createGame,
  EMPTY_INPUT,
  spawnEnemy,
  startGame,
  stepGame,
  toCompletedRun,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type GameState,
  type InputState,
} from "../src";

const NO_INPUT: InputState = { ...EMPTY_INPUT };

describe("game simulation", () => {
  it("produces the same wave for the same seed", () => {
    const first = createGame({ seed: 42 });
    const second = createGame({ seed: 42 });
    startGame(first);
    startGame(second);

    advance(first, 12_000);
    advance(second, 12_000);

    expect(
      first.enemies.map(({ kind, target, x, y, health }) => ({
        kind,
        target,
        x,
        y,
        health,
      })),
    ).toEqual(
      second.enemies.map(({ kind, target, x, y, health }) => ({
        kind,
        target,
        x,
        y,
        health,
      })),
    );
    expect(first.randomState).toBe(second.randomState);
  });

  it("normalizes diagonal movement and clamps the guardian to the arena", () => {
    const game = createGame();
    expect(game.player.speed).toBeCloseTo(235 * 1.1 * 1.05 * 1.2);
    expect(game.player.health).toBe(5);
    expect(game.player.maxHealth).toBe(5);
    startGame(game);
    const diagonalInput = {
      up: true,
      left: true,
      down: false,
      right: false,
    };

    advance(game, 10_000, diagonalInput);

    expect(game.player.x).toBe(game.player.radius);
    expect(game.player.y).toBe(game.player.radius);
    expect(game.player.x).toBeGreaterThanOrEqual(0);
    expect(game.player.y).toBeLessThanOrEqual(WORLD_HEIGHT);
    expect(game.player.x).toBeLessThanOrEqual(WORLD_WIDTH);
  });

  it("automatically fires at nearby threats and awards score", () => {
    const game = createGame();
    const enemy = spawnEnemy(game, "fee-sprite", {
      x: game.player.x + 45,
      y: game.player.y,
    });
    enemy.health = 1;
    game.spawnCooldownMs = 20_000;
    startGame(game);

    advance(game, 500);

    expect(game.enemies).toHaveLength(0);
    expect(game.defeatedCount).toBe(1);
    expect(game.score).toBe(enemy.scoreValue);
  });

  it("fires faster only while the guardian is actually moving", () => {
    const stationary = createGame();
    const moving = createGame();
    const blocked = createGame();
    blocked.player.x = WORLD_WIDTH - blocked.player.radius;
    for (const game of [stationary, moving, blocked]) {
      spawnEnemy(game, "fee-sprite", {
        x: game.player.x + (game === blocked ? -200 : 200),
        y: game.player.y,
      });
      game.spawnCooldownMs = 20_000;
      game.player.attackCooldownMs = 0;
      startGame(game);
    }

    stepGame(stationary, NO_INPUT, 20);
    stepGame(moving, { ...NO_INPUT, right: true }, 20);
    stepGame(blocked, { ...NO_INPUT, right: true }, 20);

    expect(stationary.player.moving).toBe(false);
    expect(moving.player.moving).toBe(true);
    expect(blocked.player.moving).toBe(false);
    expect(stationary.player.attackCooldownMs).toBe(680);
    expect(moving.player.attackCooldownMs).toBe(320);
    expect(blocked.player.attackCooldownMs).toBe(680);
  });

  it("reduces ledger consistency durability when a threat reaches it", () => {
    const game = createGame();
    const enemy = spawnEnemy(game, "fee-sprite", {
      x: game.vault.x + game.vault.radius + 14,
      y: game.vault.y,
    });
    enemy.target = "vault";
    game.spawnCooldownMs = 20_000;
    startGame(game);

    stepGame(game, NO_INPUT, 16);

    expect(game.vault.health).toBe(100 - enemy.damage);
  });

  it("damages the player on direct contact and grants brief invulnerability", () => {
    const game = createGame();
    const enemy = spawnEnemy(game, "fee-sprite", {
      x: game.player.x,
      y: game.player.y,
    });
    enemy.speed = 0;
    game.spawnCooldownMs = 20_000;
    startGame(game);

    stepGame(game, NO_INPUT, 16);
    expect(game.player.health).toBe(4);

    stepGame(game, NO_INPUT, 16);
    expect(game.player.health).toBe(4);
  });

  it("routes three of every four regular enemies to the player", () => {
    const game = createGame();
    game.player.x = 100;
    game.player.y = 100;
    game.spawnCooldownMs = 20_000;
    const enemies = Array.from({ length: 8 }, (_, index) =>
      spawnEnemy(game, "fee-sprite", {
        x: index === 0 || index === 3 ? 200 : 900,
        y: index === 0 || index === 3 ? 100 : 500,
      }),
    );
    const playerHunter = enemies[0]!;
    const vaultHunter = enemies[3]!;

    expect(enemies.filter((enemy) => enemy.target === "player")).toHaveLength(6);
    expect(enemies.filter((enemy) => enemy.target === "vault")).toHaveLength(2);
    startGame(game);
    stepGame(game, NO_INPUT, 100);
    expect(playerHunter.x).toBeLessThan(200);
    expect(vaultHunter.x).toBeGreaterThan(200);
  });

  it("spawns and requires the final audit boss before awarding a win", () => {
    const game = createGame({
      seed: 7,
      roundDurationMs: 2_000,
      bossAtMs: 500,
    });
    game.spawnCooldownMs = 20_000;
    startGame(game);
    advance(game, 500);

    const boss = game.enemies.find((enemy) => enemy.kind === "overdraft-boss");
    expect(boss).toBeDefined();
    if (!boss) {
      throw new Error("Expected the final audit boss to spawn.");
    }
    boss.x = game.player.x + 50;
    boss.y = game.player.y;
    boss.health = 1;

    advance(game, 300);
    expect(game.bossDefeated).toBe(true);

    advance(game, 1_200);
    expect(game.phase).toBe("won");
    expect(toCompletedRun(game)).toMatchObject({
      outcome: "won",
      defeatedCount: 1,
      score: boss.scoreValue,
    });
  });

  it("wins the instant the boss is defeated, before the timer ends", () => {
    const game = createGame({ seed: 7, roundDurationMs: 100_000, bossAtMs: 500 });
    game.spawnCooldownMs = 20_000;
    startGame(game);
    advance(game, 500);

    const boss = game.enemies.find((enemy) => enemy.kind === "overdraft-boss");
    if (!boss) {
      throw new Error("Expected the final audit boss to spawn.");
    }
    boss.x = game.player.x + 50;
    boss.y = game.player.y;
    boss.health = 1;

    advance(game, 300);

    expect(game.phase).toBe("won");
    expect(game.bossDefeated).toBe(true);
    expect(game.elapsedMs).toBeLessThan(game.roundDurationMs);
  });

  it("ends the shift when the vault is depleted", () => {
    const game = createGame();
    game.vault.health = 1;
    const enemy = spawnEnemy(game, "fee-sprite", {
      x: game.vault.x + game.vault.radius + 14,
      y: game.vault.y,
    });
    enemy.target = "vault";
    game.spawnCooldownMs = 20_000;
    startGame(game);

    stepGame(game, NO_INPUT, 16);

    expect(game.phase).toBe("lost");
    expect(game.outcomeReason).toContain("차대 정합성");
    expect(toCompletedRun(game)?.outcome).toBe("lost");
  });

  it.each([1, 7, 42, 2025, 9001])(
    "stops a stationary center camper during stage 1 in both modes for seed %i",
    (seed) => {
      for (const workshopMode of ["baseline", "demo"] as const) {
        const game = createGame({ seed, workshopMode });
        game.player.x = game.vault.x;
        game.player.y = game.vault.y;
        startGame(game);
        while (game.phase === "playing" && game.stage < 2) {
          stepGame(game, NO_INPUT, 20);
        }

        expect(game.phase).toBe("lost");
        expect(game.stage).toBe(1);
        expect(game.player.health).toBe(0);
      }
    },
  );

  it.each([7, 2025, 9001])(
    "lets a simple interception policy win seed %i",
    (seed) => {
      const game = runShift(seed, simpleInterceptionInput);

      expect(game.phase).toBe("won");
      expect(game.bossDefeated).toBe(true);
      expect(game.vault.health).toBeGreaterThan(0);
      expect(game.elapsedMs).toBeGreaterThanOrEqual(90_000);
    },
  );
});

function runShift(
  seed: number,
  inputForState: (state: GameState) => InputState,
): GameState {
  const state = createGame({ seed });
  startGame(state);
  while (state.phase === "playing") {
    stepGame(state, inputForState(state), 20);
  }
  return state;
}

function simpleInterceptionInput(state: GameState): InputState {
  const target =
    state.enemies.find((enemy) => enemy.kind === "overdraft-boss") ??
    [...state.enemies].sort(
      (left, right) =>
        Math.hypot(left.x - state.vault.x, left.y - state.vault.y) -
          Math.hypot(right.x - state.vault.x, right.y - state.vault.y) ||
        left.id - right.id,
    )[0];
  if (!target) {
    return NO_INPUT;
  }

  const x = target.x - state.player.x;
  const y = target.y - state.player.y;
  if (Math.hypot(x, y) <= 190) {
    const moveRight = Math.floor(state.elapsedMs / 140) % 2 === 0;
    return { ...NO_INPUT, left: !moveRight, right: moveRight };
  }
  return {
    up: y < -55,
    down: y > 55,
    left: x < -55,
    right: x > 55,
  };
}

function advance(
  state: GameState,
  durationMs: number,
  input: InputState = NO_INPUT,
): void {
  const stepMs = 20;
  for (let elapsed = 0; elapsed < durationMs; elapsed += stepMs) {
    stepGame(state, input, Math.min(stepMs, durationMs - elapsed));
  }
}
