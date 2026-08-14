import assert from "node:assert/strict";
import test from "node:test";
import { isRunResult, type RunResult } from "../src/runResult.js";

test("accepts only bounded integer run results", () => {
  const valid: RunResult = {
    outcome: "won",
    score: 3_200,
    defeatedCount: 12,
    durabilityRemaining: 84,
    durationMs: 92_000,
  };

  assert.equal(isRunResult(valid), true);
  for (const invalid of [
    { ...valid, score: 1.5 },
    { ...valid, defeatedCount: -1 },
    { ...valid, durabilityRemaining: 101 },
    { ...valid, durationMs: Number.MAX_SAFE_INTEGER + 1 },
  ]) {
    assert.equal(isRunResult(invalid), false);
  }
});
