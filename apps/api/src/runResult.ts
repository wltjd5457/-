export interface RunResult {
  outcome: "won" | "lost";
  score: number;
  defeatedCount: number;
  durabilityRemaining: number;
  durationMs: number;
}

export function isRunResult(value: unknown): value is RunResult {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    (candidate.outcome === "won" || candidate.outcome === "lost") &&
    isNonNegativeSafeInteger(candidate.score) &&
    isNonNegativeSafeInteger(candidate.defeatedCount) &&
    isNonNegativeSafeInteger(candidate.durabilityRemaining) &&
    candidate.durabilityRemaining <= 100 &&
    isNonNegativeSafeInteger(candidate.durationMs)
  );
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
