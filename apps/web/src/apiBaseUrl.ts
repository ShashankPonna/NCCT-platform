// Single source of truth for the API's base URL.
//
// `@ncct/api-client` deliberately doesn't read env vars itself (Vite and a
// native WebView expose them differently), so it ships with a
// `http://localhost:4000` default and expects each app to call
// `setApiBaseUrl()` at startup. That call lives in `main.tsx`.
//
// Why this file exists rather than inlining the expression: `useSession.ts`
// fetches `GET /api/profile` with a bare `fetch` instead of going through
// api-client, so the value has to be shared. When it wasn't, the two paths
// drifted — api-client kept its localhost default while useSession used
// VITE_API_URL, so on a real Android device the session loaded but every
// other request in the app went to the phone itself and failed.
export const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
