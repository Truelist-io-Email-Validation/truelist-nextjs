import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: {
      index: "src/index.ts",
      server: "src/server.ts",
      middleware: "src/middleware.ts",
      zod: "src/zod.ts",
    },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: true,
    external: ["next", "react", "zod", "next/server"],
    treeshake: true,
    splitting: true,
  },
]);
