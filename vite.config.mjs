import { defineConfig } from "vite";
import { cloudApiPlugin } from "./server/cloud-api.mjs";

export default defineConfig({
  server: { host: "127.0.0.1" },
  plugins: [cloudApiPlugin()]
});
