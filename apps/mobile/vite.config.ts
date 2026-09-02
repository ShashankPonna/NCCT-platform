import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// base: "" (relative asset paths) — required for Capacitor, which serves
// this build from a file:// / capacitor:// root inside the native WebView,
// not from a web server's "/".
export default defineConfig({
  base: "",
  plugins: [react(), tailwindcss()],
});
