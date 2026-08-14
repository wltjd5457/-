import type { CompletedRun } from "@mochi-pay/game-core";
import type { WorkshopMode } from "@mochi-pay/game-core";

export interface GameConfigResponse {
  version: string;
  roundDurationSeconds: number;
  bossAtSeconds: number;
  dailySeed: number;
  workshopMode: WorkshopMode;
  missions: {
    consistencyHotfix: boolean;
    receiptWeaponUpgrade: boolean;
    dawnInspectionStage: boolean;
    endlessRecordStage: boolean;
    soundRoom: boolean;
  };
}

export interface ResultReceipt {
  receiptId: string;
  accepted: boolean;
}

export async function fetchGameConfig(
  mode: WorkshopMode,
  signal?: AbortSignal,
): Promise<GameConfigResponse> {
  const response = await fetch(`/api/game-config?mode=${mode}`, { signal });
  if (!response.ok) {
    throw new Error(`게임 설정을 불러오지 못했습니다. 상태 코드: ${response.status}`);
  }
  return response.json() as Promise<GameConfigResponse>;
}

export async function submitResult(run: CompletedRun): Promise<ResultReceipt> {
  const response = await fetch("/api/results", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(run),
  });
  if (!response.ok) {
    throw new Error(`게임 결과를 저장하지 못했습니다. 상태 코드: ${response.status}`);
  }
  return response.json() as Promise<ResultReceipt>;
}
