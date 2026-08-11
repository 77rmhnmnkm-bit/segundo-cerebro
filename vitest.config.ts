import { defineConfig, configDefaults } from "vitest/config";

export default defineConfig({
  test: {
    include: ["apps/**/*.test.ts", "packages/**/*.test.ts"],
    exclude: [...configDefaults.exclude, "**/ml-venv/**"],
    environment: "node",
  },
});
