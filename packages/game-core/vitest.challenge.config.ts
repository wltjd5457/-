import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => ({
  test: {
    include: ["workshop/*.challenge.ts"],
    env: {
      WORKSHOP_MODE: mode === "demo" ? "demo" : "baseline",
    },
  },
}));
