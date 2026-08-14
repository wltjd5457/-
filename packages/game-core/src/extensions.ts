import type { Enemy, GameState, Vector } from "./types";

export interface WorkshopHelpers {
  rewardDefeat(state: GameState, enemy: Enemy): void;
  startSecondStage(state: GameState): void;
  startEndlessStage(state: GameState): void;
  squaredDistance(left: Vector, right: Vector): number;
}

export interface WorkshopExtension {
  afterDefeat(state: GameState, enemy: Enemy, helpers: WorkshopHelpers): boolean;
  activateCashbackUltimate(state: GameState, helpers: WorkshopHelpers): number;
  activateTearfulReceiptUpgrade(state: GameState): boolean;
}
