import { fileURLToPath } from "node:url";
import capnwebValidate from "capnweb-validate/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [capnwebValidate()],
  test: {
    include: ["__tests__/*.test.ts"],
    environment: "node",
    alias: {
      // Lets `src/portal.ts` -- which declares a Durable Object, a `WorkerEntrypoint`, and an
      // `RpcTarget` -- be imported at all. See the stub for what it does and does not provide.
      "cloudflare:workers": fileURLToPath(
        new URL("./__tests__/stubs/cloudflare-workers.ts", import.meta.url)),
    },
  },
});
