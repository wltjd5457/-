export type GamePhase = "ready" | "playing" | "won" | "lost";
export type GameStage = 1 | 2 | 3;
export type WorkshopMode = "baseline" | "demo";

export type EnemyKind = "fee-sprite" | "duplicate-blob" | "chargeback-crab" | "overdraft-boss";
export type EnemyTarget = "player" | "vault";

export interface Vector {
  x: number;
  y: number;
}

export interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

export interface Player extends Vector {
  radius: number;
  speed: number;
  health: number;
  maxHealth: number;
  weaponLevel: 1 | 2;
  moving: boolean;
  attackCooldownMs: number;
  invulnerableMs: number;
}

export interface Vault extends Vector {
  radius: number;
  health: number;
  maxHealth: number;
}

export interface Enemy extends Vector {
  id: number;
  kind: EnemyKind;
  target: EnemyTarget;
  radius: number;
  speed: number;
  health: number;
  maxHealth: number;
  damage: number;
  scoreValue: number;
  contactCooldownMs: number;
}

export interface Projectile extends Vector {
  id: number;
  velocity: Vector;
  radius: number;
  damage: number;
  tearful: boolean;
  lifetimeMs: number;
}

export interface GameState {
  phase: GamePhase;
  seed: number;
  randomState: number;
  nextEntityId: number;
  regularEnemySpawnCount: number;
  elapsedMs: number;
  totalElapsedMs: number;
  roundDurationMs: number;
  bossAtMs: number;
  stage: GameStage;
  spawnCooldownMs: number;
  score: number;
  defeatedCount: number;
  bossSpawned: boolean;
  bossDefeated: boolean;
  outcomeReason: string | null;
  announcement: string;
  announcementUntilMs: number;
  player: Player;
  vault: Vault;
  enemies: Enemy[];
  projectiles: Projectile[];
  workshop: WorkshopState;
}

export interface GameOptions {
  seed?: number;
  roundDurationMs?: number;
  bossAtMs?: number;
  workshopMode?: WorkshopMode;
}

export interface WorkshopState {
  mode: WorkshopMode;
  ultimateCharge: number;
  ultimatePulseMs: number;
}

export interface CompletedRun {
  outcome: Extract<GamePhase, "won" | "lost">;
  score: number;
  defeatedCount: number;
  durabilityRemaining: number;
  durationMs: number;
}
