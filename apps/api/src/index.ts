import express from "express";
import { isRunResult } from "./runResult.js";

const PORT = Number.parseInt(process.env.PORT ?? "4173", 10);
const HOST = process.env.HOST ?? "127.0.0.1";

const app = express();
let receiptCounter = 0;
const BASELINE_MISSIONS = {
  consistencyHotfix: false,
  receiptWeaponUpgrade: false,
  dawnInspectionStage: false,
  endlessRecordStage: false,
  soundRoom: false,
};
const DEMO_MISSIONS = {
  consistencyHotfix: true,
  receiptWeaponUpgrade: true,
  dawnInspectionStage: true,
  endlessRecordStage: true,
  soundRoom: true,
};

app.disable("x-powered-by");
app.use(express.json({ limit: "8kb" }));

app.get("/api/health", (_request, response) => {
  response.json({ status: "ok", service: "mochi-pay-api" });
});

app.get("/api/game-config", (request, response) => {
  const workshopMode = request.query.mode === "demo" ? "demo" : "baseline";
  response.json({
    version: "workshop-v1",
    roundDurationSeconds: 100,
    bossAtSeconds: 88,
    dailySeed: 2025,
    workshopMode,
    missions: workshopMode === "demo" ? DEMO_MISSIONS : BASELINE_MISSIONS,
  });
});

app.post("/api/results", (request, response) => {
  if (!isRunResult(request.body)) {
    response.status(400).json({ error: "완료된 게임 결과 형식이 올바르지 않습니다." });
    return;
  }

  receiptCounter += 1;
  response.status(201).json({
    receiptId: `vault-${Date.now().toString(36)}-${receiptCounter}`,
    accepted: true,
    result: request.body,
  });
});

const server = app.listen(PORT, HOST, () => {
  console.log(`원장 사수 API가 http://${HOST}:${PORT} 에서 실행 중입니다.`);
});

function shutDown(): void {
  server.close((error) => {
    if (error) {
      console.error("API 종료에 실패했습니다.", error);
      process.exitCode = 1;
    }
  });
}

process.on("SIGTERM", shutDown);
process.on("SIGINT", shutDown);
