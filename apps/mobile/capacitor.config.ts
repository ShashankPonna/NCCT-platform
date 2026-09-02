import type { CapacitorConfig } from "@capacitor/cli";

// appId is a placeholder reverse-domain identifier — change it before any
// real Play Store submission (it can't be changed after first publish).
//
// webDir points at apps/web's own build output, not a local one — this
// package has no src/ of its own. Per DECISIONS.md #22, the mobile app is a
// Capacitor wrapper around the same web app every role already uses
// (App.tsx's existing role branching — admin/trainer/employer vs trainee —
// is what decides what a signed-in user sees, exactly as it does on web),
// not a separate trainee-only codebase. Run `pnpm --filter mobile sync` (or
// `android`) to build apps/web and copy the result in before opening/running
// the native project — `webDir` itself is never built directly here.
const config: CapacitorConfig = {
  appId: "com.ncct.app",
  appName: "NCCT Platform",
  webDir: "../web/dist",
};

export default config;
