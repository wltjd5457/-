import type { WorkshopExtension } from "./extensions";

export const BASELINE_WORKSHOP_EXTENSION: WorkshopExtension = {
  afterDefeat() {
    return false;
  },
  activateCashbackUltimate() {
    return 0;
  },
  activateTearfulReceiptUpgrade() {
    return false;
  },
};
