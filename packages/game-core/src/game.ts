import {
  DEFAULT_BOSS_AT_MS,
  DEFAULT_ROUND_DURATION_MS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from "./config";
import { BASELINE_WORKSHOP_EXTENSION } from "./baselineMissions";
import { DEMO_WORKSHOP_EXTENSION } from "./demoMissions";
import type { WorkshopExtension, WorkshopHelpers } from "./extensions";
import { nextRandom } from "./random";
import type {
  CompletedRun,
  Enemy,
  EnemyKind,
  GameOptions,
  GameState,
  InputState,
  Projectile,
  Vector,
  WorkshopMode,
} from "./types";

const PLAYER_START_X = WORLD_WIDTH / 2;
const PLAYER_START_Y = WORLD_HEIGHT / 2 + 190;
const VAULT_X = WORLD_WIDTH / 2;
const VAULT_Y = WORLD_HEIGHT / 2;
export const ENDLESS_TIER_MS = 20_000;
const WORKSHOP_EXTENSIONS: Record<WorkshopMode, WorkshopExtension> = {
  baseline: BASELINE_WORKSHOP_EXTENSION,
  demo: DEMO_WORKSHOP_EXTENSION,
};

const ENEMY_STATS: Record<
  EnemyKind,
  Pick<Enemy, "radius" | "speed" | "maxHealth" | "damage" | "scoreValue">
> = {
  "fee-sprite": { radius: 15, speed: 68 * 1.15 * 1.3, maxHealth: 4, damage: 3, scoreValue: 90 },
  "duplicate-blob": { radius: 17, speed: 95 * 1.15 * 1.3, maxHealth: 6, damage: 4, scoreValue: 130 },
  "chargeback-crab": { radius: 21, speed: 49 * 1.15 * 1.3, maxHealth: 11, damage: 6, scoreValue: 210 },
  "overdraft-boss": { radius: 44, speed: 89 * 1.15 * 1.3, maxHealth: 60, damage: 10, scoreValue: 2_500 },
};

export function createGame(options: GameOptions = {}): GameState {
  const seed = (options.seed ?? 2025) >>> 0;
  const roundDurationMs = options.roundDurationMs ?? DEFAULT_ROUND_DURATION_MS;
  const requestedBossAtMs = options.bossAtMs ?? DEFAULT_BOSS_AT_MS;

  return {
    phase: "ready",
    seed,
    randomState: seed,
    nextEntityId: 1,
    regularEnemySpawnCount: 0,
    elapsedMs: 0,
    totalElapsedMs: 0,
    roundDurationMs,
    bossAtMs: Math.min(requestedBossAtMs, roundDurationMs * 0.9),
    stage: 1,
    spawnCooldownMs: 350,
    score: 0,
    defeatedCount: 0,
    bossSpawned: false,
    bossDefeated: false,
    outcomeReason: null,
    announcement: "원장 서버를 지키고 최종 마감 배치를 완료하세요!",
    announcementUntilMs: 4_000,
    player: {
      x: PLAYER_START_X,
      y: PLAYER_START_Y,
      radius: 18,
      speed: 235 * 1.1 * 1.05 * 1.2,
      health: 5,
      maxHealth: 5,
      weaponLevel: 1,
      moving: false,
      attackCooldownMs: 120,
      invulnerableMs: 0,
    },
    vault: {
      x: VAULT_X,
      y: VAULT_Y,
      radius: 46,
      health: 100,
      maxHealth: 100,
    },
    enemies: [],
    projectiles: [],
    workshop: {
      mode: options.workshopMode ?? "baseline",
      ultimateCharge: 0,
      ultimatePulseMs: 0,
    },
  };
}

export function startGame(state: GameState): void {
  if (state.phase === "ready") {
    state.phase = "playing";
  }
}

export function stepGame(state: GameState, input: InputState, deltaMs: number): void {
  if (state.phase !== "playing" || deltaMs <= 0) {
    return;
  }

  const safeDeltaMs = Math.min(deltaMs, 100);
  const previousEndlessLevel = getEndlessLevel(state);
  state.elapsedMs =
    state.stage === 3
      ? state.elapsedMs + safeDeltaMs
      : Math.min(state.elapsedMs + safeDeltaMs, state.roundDurationMs);
  state.totalElapsedMs += safeDeltaMs;
  state.player.attackCooldownMs -= safeDeltaMs;
  state.player.invulnerableMs = Math.max(0, state.player.invulnerableMs - safeDeltaMs);
  state.workshop.ultimatePulseMs = Math.max(
    0,
    state.workshop.ultimatePulseMs - safeDeltaMs,
  );
  const currentEndlessLevel = getEndlessLevel(state);
  if (currentEndlessLevel > previousEndlessLevel) {
    upgradeEndlessEnemies(state, previousEndlessLevel, currentEndlessLevel);
    state.announcement = `무한 점검 WAVE ${currentEndlessLevel}! 장애와 전표 날리기 동시 강화`;
    state.announcementUntilMs = state.elapsedMs + 3_000;
  }

  movePlayer(state, input, safeDeltaMs);
  spawnScheduledEnemies(state, safeDeltaMs);
  fireAutomaticAttack(state);
  updateProjectiles(state, safeDeltaMs);
  updateEnemies(state, safeDeltaMs);
  resolveOutcome(state);
}

export function spawnEnemy(
  state: GameState,
  kind: EnemyKind,
  position?: Vector,
): Enemy {
  const stats = ENEMY_STATS[kind];
  const endlessLevel = getEndlessLevel(state);
  const advancedStage = state.stage >= 2;
  const healthMultiplier =
    (advancedStage ? 1.3 * 1.15 : 1.15) *
    endlessScale(endlessLevel, 0.1) *
    (state.stage === 2 && kind === "overdraft-boss" ? 1.4 : 1);
  const speedMultiplier =
    (advancedStage ? 1.2 * 1.1 : 1) * endlessScale(endlessLevel, 0.04);
  const damageMultiplier =
    (advancedStage ? 1.2 : 1) * endlessScale(endlessLevel, 0.08);
  const spawnPosition = position ?? randomEdgePosition(state);
  const id = state.nextEntityId++;
  const target =
    kind === "overdraft-boss"
      ? "vault"
      : state.regularEnemySpawnCount++ % 4 < 3
        ? "player"
        : "vault";
  const enemy: Enemy = {
    id,
    kind,
    target,
    ...spawnPosition,
    radius: stats.radius,
    speed: stats.speed * speedMultiplier,
    health: Math.ceil(stats.maxHealth * healthMultiplier),
    maxHealth: Math.ceil(stats.maxHealth * healthMultiplier),
    damage: Math.ceil(stats.damage * damageMultiplier),
    scoreValue: Math.round(
      stats.scoreValue *
        (advancedStage ? 1.2 : 1) *
        endlessScale(endlessLevel, 0.1),
    ),
    contactCooldownMs: 0,
  };
  state.enemies.push(enemy);
  return enemy;
}

export function toCompletedRun(state: GameState): CompletedRun | null {
  if (state.phase !== "won" && state.phase !== "lost") {
    return null;
  }
  return {
    outcome: state.phase,
    score: state.score,
    defeatedCount: state.defeatedCount,
    durabilityRemaining: Math.round(state.vault.health),
    durationMs: Math.round(state.totalElapsedMs),
  };
}

export function activateCashbackUltimate(state: GameState): number {
  return workshopExtension(state).activateCashbackUltimate(state, WORKSHOP_HELPERS);
}

export function activateTearfulReceiptUpgrade(state: GameState): boolean {
  return workshopExtension(state).activateTearfulReceiptUpgrade(state);
}

export function getEndlessLevel(state: GameState): number {
  return state.stage === 3 ? Math.floor(state.elapsedMs / ENDLESS_TIER_MS) + 1 : 0;
}

function movePlayer(state: GameState, input: InputState, deltaMs: number): void {
  let xDirection = Number(input.right) - Number(input.left);
  let yDirection = Number(input.down) - Number(input.up);
  if (xDirection !== 0 && yDirection !== 0) {
    const diagonalScale = Math.SQRT1_2;
    xDirection *= diagonalScale;
    yDirection *= diagonalScale;
  }

  const distance = state.player.speed * (deltaMs / 1_000);
  const previousX = state.player.x;
  const previousY = state.player.y;
  state.player.x = clamp(
    state.player.x + xDirection * distance,
    state.player.radius,
    WORLD_WIDTH - state.player.radius,
  );
  state.player.y = clamp(
    state.player.y + yDirection * distance,
    state.player.radius,
    WORLD_HEIGHT - state.player.radius,
  );
  state.player.moving =
    state.player.x !== previousX || state.player.y !== previousY;
}

function spawnScheduledEnemies(state: GameState, deltaMs: number): void {
  if (state.stage !== 3 && !state.bossSpawned && state.elapsedMs >= state.bossAtMs) {
    state.bossSpawned = true;
    spawnEnemy(state, "overdraft-boss");
    state.announcement =
      state.stage === 2
        ? "새벽 재점검: 갑자기 튀어나온 더 큰 숫자 등장!"
        : "최종 마감 배치: 갑자기 튀어나온 초면인 숫자 등장!";
    state.announcementUntilMs = state.elapsedMs + 4_000;
  }

  state.spawnCooldownMs -= deltaMs;
  if (state.spawnCooldownMs > 0) {
    return;
  }

  const progress = state.stage === 3 ? 1 : state.elapsedMs / state.roundDurationMs;
  spawnEnemy(state, chooseEnemyKind(state, progress));
  if (progress > 0.68 && random(state) < 0.25) {
    spawnEnemy(state, "fee-sprite");
  }
  const stagePace =
    state.stage === 3
      ? Math.max(0.25, 0.65 - (getEndlessLevel(state) - 1) * 0.04)
      : state.stage === 2
        ? 0.7
        : 1;
  state.spawnCooldownMs +=
    (Math.max(540, 1_350 - progress * 700) * stagePace) / 1.15;
}

function chooseEnemyKind(state: GameState, progress: number): EnemyKind {
  const roll = random(state);
  if (progress > 0.45 && roll > 0.76) {
    return "chargeback-crab";
  }
  if (progress > 0.18 && roll > 0.43) {
    return "duplicate-blob";
  }
  return "fee-sprite";
}

function fireAutomaticAttack(state: GameState): void {
  if (state.player.attackCooldownMs > 0 || state.enemies.length === 0) {
    return;
  }

  const target = state.enemies
    .filter((enemy) => squaredDistance(state.player, enemy) <= 320 * 320)
    .sort(
      (left, right) =>
        Number(right.kind === "overdraft-boss") -
          Number(left.kind === "overdraft-boss") ||
        squaredDistance(state.player, left) - squaredDistance(state.player, right),
    )[0];
  if (!target) {
    state.player.attackCooldownMs = 90;
    return;
  }

  const direction = normalizedDirection(state.player, target);
  const angles = state.player.weaponLevel === 2 ? [-0.18, 0, 0.18] : [0];
  const endlessLevel = getEndlessLevel(state);
  for (const angle of angles) {
    const rotated = rotate(direction, angle);
    state.projectiles.push({
      id: state.nextEntityId++,
      x: state.player.x + rotated.x * 22,
      y: state.player.y + rotated.y * 22,
      velocity: {
        x: rotated.x * 590,
        y: rotated.y * 590,
      },
      radius: 7,
      damage: 6 * 0.85 * endlessScale(endlessLevel, 0.05),
      tearful: state.player.weaponLevel === 2 && angle !== 0,
      lifetimeMs: 1_000,
    });
  }
  state.player.attackCooldownMs +=
    (state.player.moving ? 340 : 700) / endlessScale(endlessLevel, 0.03);
}

function updateProjectiles(state: GameState, deltaMs: number): void {
  const stageAtStart = state.stage;
  const survivingProjectiles: Projectile[] = [];
  const defeatedEnemyIds = new Set<number>();

  for (const projectile of state.projectiles) {
    projectile.x += projectile.velocity.x * (deltaMs / 1_000);
    projectile.y += projectile.velocity.y * (deltaMs / 1_000);
    projectile.lifetimeMs -= deltaMs;

    const hitEnemy = state.enemies.find(
      (enemy) =>
        !defeatedEnemyIds.has(enemy.id) &&
        squaredDistance(projectile, enemy) <= (projectile.radius + enemy.radius) ** 2,
    );
    if (hitEnemy) {
      hitEnemy.health -= projectile.damage;
      if (hitEnemy.health <= 0) {
        defeatedEnemyIds.add(hitEnemy.id);
        rewardDefeat(state, hitEnemy);
      }
      continue;
    }

    if (
      projectile.lifetimeMs > 0 &&
      projectile.x >= 0 &&
      projectile.x <= WORLD_WIDTH &&
      projectile.y >= 0 &&
      projectile.y <= WORLD_HEIGHT
    ) {
      survivingProjectiles.push(projectile);
    }
  }

  state.projectiles = state.stage === stageAtStart ? survivingProjectiles : [];
  if (defeatedEnemyIds.size > 0) {
    state.enemies = state.enemies.filter((enemy) => !defeatedEnemyIds.has(enemy.id));
  }
}

function updateEnemies(state: GameState, deltaMs: number): void {
  for (const enemy of state.enemies) {
    enemy.contactCooldownMs = Math.max(0, enemy.contactCooldownMs - deltaMs);
    const targetsPlayer = enemy.target === "player";
    const target = targetsPlayer ? state.player : state.vault;
    const direction = normalizedDirection(enemy, target);
    const distanceToTarget = Math.sqrt(squaredDistance(enemy, target));
    const contactDistance = enemy.radius + target.radius;

    if (distanceToTarget > contactDistance) {
      enemy.x += direction.x * enemy.speed * (deltaMs / 1_000);
      enemy.y += direction.y * enemy.speed * (deltaMs / 1_000);
    } else if (!targetsPlayer && enemy.contactCooldownMs === 0) {
      state.vault.health = Math.max(0, state.vault.health - enemy.damage);
      enemy.contactCooldownMs = 1_100;
    }

    const playerContactDistance = enemy.radius + state.player.radius;
    if (
      state.player.invulnerableMs === 0 &&
      squaredDistance(enemy, state.player) <= playerContactDistance ** 2
    ) {
      state.player.health = Math.max(0, state.player.health - 1);
      state.player.invulnerableMs = 1_400;
      enemy.x -= direction.x * 20;
      enemy.y -= direction.y * 20;
    }
  }
}

function rewardDefeat(state: GameState, enemy: Enemy): void {
  state.score += enemy.scoreValue;
  state.defeatedCount += 1;
  const handled = workshopExtension(state).afterDefeat(
    state,
    enemy,
    WORKSHOP_HELPERS,
  );
  if (enemy.kind === "overdraft-boss" && !handled) {
    state.bossDefeated = true;
    state.announcement = "마감 완료! 원장 서버 사수 성공!";
    state.announcementUntilMs = state.elapsedMs + 3_000;
  }
}

function startEndlessStage(state: GameState): void {
  state.stage = 3;
  state.elapsedMs = 0;
  state.bossSpawned = false;
  state.bossDefeated = false;
  state.spawnCooldownMs = 800;
  state.enemies = [];
  state.projectiles = [];
  state.announcement = "히든 스테이지 해금! 무한 점검 기록전 시작!";
  state.announcementUntilMs = 4_000;
}

function startSecondStage(state: GameState): void {
  state.stage = 2;
  state.elapsedMs = 0;
  state.bossSpawned = false;
  state.bossDefeated = false;
  state.spawnCooldownMs = 1_200;
  state.enemies = [];
  state.projectiles = [];
  state.announcement = "1단계 완료! 2단계 새벽 점검실 시작!";
  state.announcementUntilMs = 4_000;
}

function resolveOutcome(state: GameState): void {
  if (state.player.health <= 0) {
    state.phase = "lost";
    state.outcomeReason = "토대리의 생명이 모두 소진되었습니다.";
    return;
  }
  if (state.vault.health <= 0) {
    state.phase = "lost";
    state.outcomeReason = "차대 정합성이 모두 소진되었습니다.";
    return;
  }
  if (state.bossDefeated) {
    state.phase = "won";
    state.outcomeReason =
      state.stage === 2
        ? "원장 서버를 지키고 새벽 재점검까지 완료했습니다!"
        : "원장 서버를 지키고 최종 마감 배치를 완료했습니다!";
    return;
  }
  if (state.stage !== 3 && state.elapsedMs >= state.roundDurationMs) {
    state.phase = "lost";
    state.outcomeReason = "오전 9시 영업 전까지 최종 마감 배치를 완료하지 못했습니다.";
  }
}

function upgradeEndlessEnemies(
  state: GameState,
  previousLevel: number,
  currentLevel: number,
): void {
  const healthRatio =
    endlessScale(currentLevel, 0.1) / endlessScale(previousLevel, 0.1);
  const speedRatio =
    endlessScale(currentLevel, 0.04) / endlessScale(previousLevel, 0.04);
  const damageRatio =
    endlessScale(currentLevel, 0.08) / endlessScale(previousLevel, 0.08);
  for (const enemy of state.enemies) {
    enemy.health *= healthRatio;
    enemy.maxHealth = Math.ceil(enemy.maxHealth * healthRatio);
    enemy.speed *= speedRatio;
    enemy.damage = Math.ceil(enemy.damage * damageRatio);
    enemy.scoreValue = Math.round(enemy.scoreValue * healthRatio);
  }
}

function endlessScale(level: number, increase: number): number {
  return 1 + Math.max(0, level - 1) * increase;
}

function workshopExtension(state: GameState): WorkshopExtension {
  return WORKSHOP_EXTENSIONS[state.workshop.mode];
}

const WORKSHOP_HELPERS: WorkshopHelpers = {
  rewardDefeat,
  startSecondStage,
  startEndlessStage,
  squaredDistance,
};

function randomEdgePosition(state: GameState): Vector {
  const edge = Math.floor(random(state) * 4);
  const margin = 30;
  if (edge === 0) {
    return { x: random(state) * WORLD_WIDTH, y: margin };
  }
  if (edge === 1) {
    return { x: WORLD_WIDTH - margin, y: random(state) * WORLD_HEIGHT };
  }
  if (edge === 2) {
    return { x: random(state) * WORLD_WIDTH, y: WORLD_HEIGHT - margin };
  }
  return { x: margin, y: random(state) * WORLD_HEIGHT };
}

function random(state: GameState): number {
  const [value, nextState] = nextRandom(state.randomState);
  state.randomState = nextState;
  return value;
}

function normalizedDirection(from: Vector, to: Vector): Vector {
  const x = to.x - from.x;
  const y = to.y - from.y;
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length };
}

function rotate(vector: Vector, radians: number): Vector {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    x: vector.x * cosine - vector.y * sine,
    y: vector.x * sine + vector.y * cosine,
  };
}

function squaredDistance(left: Vector, right: Vector): number {
  const x = left.x - right.x;
  const y = left.y - right.y;
  return x * x + y * y;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
