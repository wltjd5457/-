import { TEARFUL_RECEIPT_SCORE } from "./config";
import type { WorkshopExtension } from "./extensions";

export const DEMO_WORKSHOP_EXTENSION: WorkshopExtension = {
  afterDefeat(state, enemy, helpers) {
    state.workshop.ultimateCharge = Math.min(
      100,
      state.workshop.ultimateCharge + 11,
    );
    if (enemy.kind !== "overdraft-boss") {
      return false;
    }
    if (state.stage === 1) {
      helpers.startSecondStage(state);
      return true;
    }
    if (state.stage === 2) {
      helpers.startEndlessStage(state);
      return true;
    }
    return false;
  },
  activateCashbackUltimate(state, helpers) {
    if (state.phase !== "playing" || state.workshop.ultimateCharge < 100) {
      return 0;
    }

    const stageAtStart = state.stage;
    const defeatedIds = new Set<number>();
    for (const enemy of state.enemies) {
      if (helpers.squaredDistance(state.player, enemy) > 340 * 340) {
        continue;
      }
      if (enemy.kind === "overdraft-boss") {
        enemy.health -= 30;
        if (enemy.health <= 0) {
          defeatedIds.add(enemy.id);
          helpers.rewardDefeat(state, enemy);
        }
      } else {
        defeatedIds.add(enemy.id);
        helpers.rewardDefeat(state, enemy);
      }
    }
    state.enemies = state.enemies.filter((enemy) => !defeatedIds.has(enemy.id));
    state.workshop.ultimateCharge = 0;
    state.workshop.ultimatePulseMs = 900;
    if (state.stage === stageAtStart) {
      state.announcement = `정합성 핫픽스! 장애 ${defeatedIds.size}건 정리`;
      state.announcementUntilMs = state.elapsedMs + 2_200;
    }
    return defeatedIds.size;
  },
  activateTearfulReceiptUpgrade(state) {
    if (
      state.phase !== "playing" ||
      state.player.weaponLevel === 2 ||
      state.score < TEARFUL_RECEIPT_SCORE
    ) {
      return false;
    }

    state.player.weaponLevel = 2;
    state.announcement = "눈물젖은 전표 날리기! 토대리의 눈물과 함께 흩날리는 전표";
    state.announcementUntilMs = state.elapsedMs + 3_000;
    return true;
  },
};
